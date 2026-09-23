import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { conversation } from "./session-review";

const HOOK = join(import.meta.dir, "session-review.ts");

const line = (type: string, content: unknown) =>
  JSON.stringify({ type, message: { role: type, content } });
// Past the hook's 2 000-character minimum.
const longText = "Agreed: an Order is a confirmed request. ".repeat(80);

describe("conversation", () => {
  test("keeps user and assistant text, drops tool calls, results and other events", () => {
    const jsonl = [
      line("user", "What is an Order?"),
      line("assistant", [
        { type: "text", text: "A confirmed request." },
        { type: "tool_use", name: "Read", input: {} },
      ]),
      line("user", [{ type: "tool_result", content: "file contents" }]),
      JSON.stringify({ type: "system", content: "noise" }),
      "not json",
    ].join("\n");
    expect(conversation(jsonl)).toBe("user: What is an Order?\n\nassistant: A confirmed request.");
  });

  test("keeps only the tail of a long session", () => {
    const text = conversation(line("user", "x".repeat(300_000)));
    expect(text.length).toBe(200_000);
  });
});

describe("hook", () => {
  let dir: string;
  let project: string;
  let transcript: string;
  let calls: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "am-hook-test-"));
    project = join(dir, "project");
    transcript = join(dir, "transcript.jsonl");
    calls = join(dir, "calls.txt");
    mkdirSync(join(project, ".about"), { recursive: true });
    mkdirSync(join(dir, "bin"));
    // A stand-in for `claude` that records how it was started. The rename makes the record
    // appear only once complete.
    const stub = join(dir, "bin", "claude");
    const record = `{ pwd; echo "$AM_SESSION_REVIEW"; printf '%s\\n' "$@"; cat; }`;
    const script = `${record} > "${calls}.tmp" && mv "${calls}.tmp" "${calls}"`;
    writeFileSync(stub, `#!/bin/sh\n${script}\n`);
    chmodSync(stub, 0o755);
    writeFileSync(transcript, [line("user", longText), line("assistant", "Recorded.")].join("\n"));
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  async function run(input: object, env: Record<string, string> = {}) {
    const { CLAUDE_PROJECT_DIR: _, ...base } = process.env;
    const proc = Bun.spawn(["bun", HOOK], {
      stdin: new Blob([JSON.stringify(input)]),
      env: { ...base, PATH: `${join(dir, "bin")}:${process.env.PATH}`, ...env },
    });
    expect(await proc.exited).toBe(0);
  }

  // The review runs detached, so poll for it; the hook itself has already exited.
  async function called(waitMs = 3000): Promise<string | null> {
    for (let i = 0; i < waitMs / 100; i++) {
      if (existsSync(calls)) return readFileSync(calls, "utf8");
      await Bun.sleep(100);
    }
    return null;
  }

  const input = () => ({
    cwd: project,
    transcript_path: transcript,
    hook_event_name: "SessionEnd",
  });

  test("starts a detached review limited to .about/", async () => {
    await run(input());
    const out = await called();
    expect(out).not.toBeNull();
    const [cwd, marker] = out!.split("\n");
    expect(cwd).toEndWith("/project");
    expect(marker).toBe("1");
    const tools = ["Read", "Glob", "Grep", "Edit(./.about/**)", "Write(./.about/**)"];
    expect(out).toContain(["--allowedTools", ...tools].join("\n"));
    expect(out).toContain(`user: ${longText}`);
  });

  test("reviews the project, not the folder the session ended in", async () => {
    const sub = join(project, "src");
    mkdirSync(sub);
    await run({ ...input(), cwd: sub }, { CLAUDE_PROJECT_DIR: project });
    expect((await called())?.split("\n")[0]).toEndWith("/project");
  });

  test("does nothing in a project without .about/", async () => {
    rmSync(join(project, ".about"), { recursive: true });
    await run(input());
    expect(await called(500)).toBeNull();
  });

  test("does nothing when the review's own session ends", async () => {
    await run(input(), { AM_SESSION_REVIEW: "1" });
    expect(await called(500)).toBeNull();
  });

  test("does nothing after a short conversation", async () => {
    writeFileSync(transcript, line("user", "hi"));
    await run(input());
    expect(await called(500)).toBeNull();
  });

  test("exits cleanly on unusable input", async () => {
    await run({ cwd: project, transcript_path: join(dir, "missing.jsonl") });
    await run({});
    expect(await called(500)).toBeNull();
  });
});
