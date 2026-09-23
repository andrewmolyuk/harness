import { beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { violations } from "./adr-immutable";

let repo: string;
const git = (...args: string[]) =>
  spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" }).stdout.trim();
const adr = (name: string, status: string, body = "We chose X.", date = "2026-09-24") =>
  `# ${name}\n\nStatus: ${status}\nDate: ${date}\n\n${body}\n`;
const put = (file: string, text: string) => {
  writeFileSync(join(repo, ".about/adr", file), text);
  git("add", "-A");
};
const commit = () => git("commit", "-q", "-m", "docs: adr");

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "adr-"));
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  mkdirSync(join(repo, ".about/adr"), { recursive: true });
  put("0001-x.md", adr("X", "accepted"));
  put("0002-y.md", adr("Y", "proposed"));
  commit();
});

describe("violations", () => {
  test("passes new ADRs and edits to proposed ones", () => {
    put("0002-y.md", adr("Y", "accepted", "We chose Y."));
    put("0003-z.md", adr("Z", "accepted"));
    expect(violations(repo)).toEqual([]);
  });

  test("blocks editing an accepted ADR", () => {
    put("0001-x.md", adr("X", "accepted", "We chose X, mostly."));
    expect(violations(repo)).toEqual([
      ".about/adr/0001-x.md: accepted, only its Status and Date may change, to supersede it",
    ]);
  });

  test("blocks deleting or renaming an accepted ADR", () => {
    git("mv", ".about/adr/0001-x.md", ".about/adr/0001-renamed.md");
    expect(violations(repo)).toEqual([
      ".about/adr/0001-x.md: accepted, can't be deleted or renamed",
    ]);
  });

  test("lets an accepted ADR be superseded by one that exists", () => {
    put("0001-x.md", adr("X", "superseded by 0003", "We chose X.", "2026-10-01"));
    expect(violations(repo)).toEqual([
      ".about/adr/0001-x.md: superseded by 0003, but there is no ADR 0003",
    ]);
    put("0003-z.md", adr("Z", "accepted"));
    expect(violations(repo)).toEqual([]);
  });

  test("blocks superseding with other edits", () => {
    put("0003-z.md", adr("Z", "accepted"));
    put("0001-x.md", adr("X", "superseded by 0003", "Changed."));
    expect(violations(repo)).toHaveLength(1);
  });

  test("blocks editing a superseded ADR", () => {
    put("0003-z.md", adr("Z", "accepted"));
    put("0001-x.md", adr("X", "superseded by 0003"));
    commit();
    put("0001-x.md", adr("X", "superseded by 0003", "Changed."));
    expect(violations(repo)).toEqual([
      ".about/adr/0001-x.md: superseded, only its Status and Date may change, to supersede it",
    ]);
  });

  test("ignores unstaged edits", () => {
    writeFileSync(join(repo, ".about/adr/0001-x.md"), adr("X", "accepted", "Changed."));
    expect(violations(repo)).toEqual([]);
  });
});
