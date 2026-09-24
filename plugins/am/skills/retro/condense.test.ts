import { describe, expect, test } from "bun:test";
import { mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  call,
  condense,
  kind,
  latest,
  projectDir,
  redact,
  report,
  summary,
  worth,
} from "./condense";

const at = (minute: number) => `2026-09-24T08:${String(minute).padStart(2, "0")}:00.000Z`;
const user = (content: unknown, extra = {}) =>
  JSON.stringify({ type: "user", timestamp: at(0), message: { content }, ...extra });
const tool = (id: string, name: string, input: object, minute = 1) =>
  JSON.stringify({
    type: "assistant",
    timestamp: at(minute),
    cwd: "/work",
    message: { content: [{ type: "tool_use", id, name, input }] },
  });
const result = (id: string, content: string, is_error = true) =>
  user([{ type: "tool_result", tool_use_id: id, content, is_error }]);

describe("kind", () => {
  test("tells failures apart by their message", () => {
    expect(kind("PreToolUse:Bash hook error: Blocked by the am guard: x")).toBe("guard");
    expect(kind("PreToolUse:Bash hook error: lint failed")).toBe("hook");
    expect(kind("The user doesn't want to proceed with this tool use.")).toBe("rejected");
    expect(kind("The server-side auto mode classifier gave no verdict")).toBe("classifier");
    expect(kind("The following part requires approval: awk")).toBe("permission");
    expect(kind("<tool_use_error>File has been modified since read")).toBe("stale");
    expect(kind("Exit code 2\nboom")).toBe("exit");
    expect(kind("something else")).toBe("other");
  });
});

describe("call", () => {
  test("names the command, or the path relative to the project", () => {
    expect(call("Bash", { command: "bun test", description: "Run tests" })).toBe("Bash(bun test)");
    expect(call("Read", { file_path: "/work/src/a.ts" }, "/work")).toBe("Read(src/a.ts)");
    expect(call("Read", { file_path: "/elsewhere/a.ts" }, "/work")).toBe("Read(/elsewhere/a.ts)");
  });
});

describe("redact", () => {
  test("hides tokens and private keys", () => {
    const token = `ghp_${"a1".repeat(18)}`;
    expect(redact(`export TOKEN=${token} done`)).toBe("export TOKEN=***** done");
    const armour = (edge: string) => `-----${edge} RSA PRIVATE KEY-----`;
    const key = `${armour("BEGIN")}\nabc\n${armour("END")}`;
    expect(redact(`key: ${key} end`)).toBe("key: ***** end");
  });

  test("keeps session ids, hashes, paths and words", () => {
    const kept = [
      "1108447f-79cb-4cd4-bb61-6d1331240608",
      "142728c0a1b2c3d4e5f60718293a4b5c6d7e8f90",
      "/Users/andrew/workspaces/harness/plugins/am/skills/retro/condense.test.ts",
      "the_quite_long_identifier_without_any_digits_at_all",
      "1108447f-79cb-4cd4-bb61-6d1331240608.jsonl",
    ].join(" ");
    expect(redact(kept)).toBe(kept);
  });
});

describe("condense", () => {
  test("keeps prompts, commands, interrupts and failed calls; drops the rest", () => {
    const jsonl = [
      JSON.stringify({ type: "ai-title", aiTitle: "Fix the thing" }),
      user("fix the thing"),
      user("<local-command-caveat>Caveat</local-command-caveat>", { isMeta: true }),
      user("<command-name>/am:tidy</command-name><command-args>docs</command-args>"),
      user([{ type: "text", text: "Base directory for this skill: /x" }]),
      tool("t1", "Bash", { command: "bun test" }),
      result("t1", "Exit code 1\n1 fail"),
      tool("t2", "Read", { file_path: "/work/a.ts" }, 5),
      result("t2", "contents", false),
      user("[Request interrupted by user for tool use]"),
      "not json",
    ].join("\n");
    const s = condense(jsonl, "abc");
    expect(s.title).toBe("Fix the thing");
    expect(s.minutes).toBe(5);
    expect(s.tools).toEqual({ Bash: 1, Read: 1 });
    expect(s.events.map((e) => e.type)).toEqual(["prompt", "command", "error", "interrupt"]);
    expect(s.events[1]).toMatchObject({ text: "/am:tidy docs" });
    const quoted = condense(user("why did <command-name>/clear</command-name> run?"));
    expect(quoted.events).toMatchObject([{ type: "prompt" }]);
    expect(s.events[2]).toMatchObject({ kind: "exit", call: "Bash(bun test)" });
  });

  test("lists calls repeated three times or more, by their full input", () => {
    const long = "x".repeat(200);
    const jsonl = [
      ...[1, 2, 3].map((i) => tool(`r${i}`, "Read", { file_path: "/work/a.ts" })),
      tool("b1", "Bash", { command: `${long} one` }),
      tool("b2", "Bash", { command: `${long} two` }),
      tool("b3", "Bash", { command: `${long} three` }),
      ...[1, 2, 3].map((i) => tool(`e${i}`, "Edit", { file_path: "/work/a.ts" })),
    ].join("\n");
    expect(condense(jsonl).repeats).toEqual([["Read(a.ts)", 3]]);
  });
});

describe("report and summary", () => {
  const jsonl = [
    user("go"),
    tool("t1", "Bash", { command: "make" }),
    result("t1", `Exit code 2\n${"noise ".repeat(100)}\nmake: *** [all] Error 2`),
    tool("t2", "Write", { file_path: "/work/b.ts" }),
    result("t2", "The server-side auto mode classifier gave no verdict"),
  ].join("\n");

  test("a failed command shows the end of its output", () => {
    const text = report(condense(jsonl, "s1"));
    expect(text).toContain("# Session s1");
    expect(text).toContain("error exit Bash(make): Exit code 2: …");
    expect(text).toContain("make: *** [all] Error 2");
    expect(text).toContain("Tools: Bash 1, Write 1");
  });

  test("counts failures across sessions by kind, commonest first", () => {
    const all = [condense(jsonl, "s1"), condense(jsonl, "s2")];
    const text = summary(all);
    expect(text).toContain("# Across 2 sessions");
    expect(text).toContain("exit: 2\n  2× in 2 session(s): Bash");
    expect(text).toContain("classifier: 2\n  2× in 2 session(s): Write");
  });

  test("lists prompts typed more than once, ignoring short ones and case", () => {
    const prompt = "Recheck all files for consistency";
    const s1 = condense([user(prompt), user("commit it")].join("\n"), "s1");
    const s2 = condense([user(prompt.toLowerCase()), user("commit it")].join("\n"), "s2");
    const text = summary([s1, s2]);
    expect(text).toContain("repeated prompts:\n  2× recheck all files for consistency");
    expect(text).not.toContain("commit it");
  });
});

describe("sessions", () => {
  test("lists the project's transcripts, newest first", () => {
    const dir = mkdtempSync(join(tmpdir(), "am-retro-"));
    for (const [name, t] of [["old", 1], ["new", 3], ["mid", 2]] as const) {
      writeFileSync(join(dir, `${name}.jsonl`), "");
      utimesSync(join(dir, `${name}.jsonl`), t, t);
    }
    writeFileSync(join(dir, "notes.txt"), "");
    expect(latest(dir)).toEqual(["new", "mid", "old"].map((n) => join(dir, `${n}.jsonl`)));
    expect(latest(join(dir, "none"))).toEqual([]);
  });

  test("a session is worth a retro when someone typed or something failed", () => {
    expect(worth(condense(user("fix the thing")))).toBe(true);
    expect(worth(condense(user("<command-name>/clear</command-name>")))).toBe(false);
    const review = user("review this conversation", { entrypoint: "sdk-cli" });
    expect(worth(condense(review))).toBe(false);
  });

  test("the project's folder is its path with every other character as -", () => {
    expect(projectDir("/Users/a/my.app", "/home")).toBe("/home/.claude/projects/-Users-a-my-app");
  });
});
