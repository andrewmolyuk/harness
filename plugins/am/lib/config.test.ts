import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { load, repoRoot } from "./config";

describe("load", () => {
  test("reads the config at the repo root from a folder inside it", () => {
    const dir = mkdtempSync(join(tmpdir(), "config-"));
    spawnSync("git", ["-C", dir, "init", "-q"]);
    mkdirSync(join(dir, "app"));
    writeFileSync(join(dir, "app", ".harness.json"), `{ "statusLine": false }`);
    expect(load(join(dir, "app"))).toBeNull();
    writeFileSync(join(dir, ".harness.json"), `{ "statusLine": true }`);
    expect(load(join(dir, "app"))).toEqual({ statusLine: true });
    expect(repoRoot(join(dir, "app"))).toEndWith(dir.split("/").pop() ?? "");
  });

  test("reads it from the folder itself outside a repo, and throws on a non-object", () => {
    const dir = mkdtempSync(join(tmpdir(), "config-"));
    expect(repoRoot(dir)).toBeNull();
    expect(load(dir)).toBeNull();
    writeFileSync(join(dir, ".harness.json"), "[]");
    expect(() => load(dir)).toThrow(".harness.json is not a JSON object");
  });
});
