import { beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SCHEMA, WRITTEN } from "../lib/config";
import { CREATED, ensure } from "./harness-config";

describe("ensure", () => {
  let dir: string;
  const file = () => join(dir, ".harness.json");
  const config = () => readFileSync(file(), "utf8");

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "harness-config-"));
    spawnSync("git", ["-C", dir, "init", "-q"]);
  });

  test("creates it at the repo root, from a folder inside, with every setting off", () => {
    mkdirSync(join(dir, "sub"));
    expect(ensure(join(dir, "sub"))).toEqual([CREATED]);
    expect(JSON.parse(config())).toEqual(WRITTEN);
    expect(existsSync(join(dir, "sub", ".harness.json"))).toBe(false);
    expect(ensure(dir)).toEqual([]);
  });

  test("adds only the missing keys, leaving the user's lines as they were", () => {
    writeFileSync(file(), `{\n    "statusLine": true,\n    "gitHooks": { "pre-push": [] }\n}\n`);
    expect(ensure(dir)).toEqual([".harness.json: added $schema, guard, guidelines"]);
    expect(config()).toBe(
      `{\n    "$schema": "${SCHEMA}",\n    "statusLine": true,\n` +
        `    "gitHooks": { "pre-push": [] },\n    "guard": {"block":[]},\n` +
        `    "guidelines": false\n}\n`,
    );
  });

  test("keeps a one-line or empty file valid", () => {
    writeFileSync(file(), `{"statusLine":true}`);
    ensure(dir);
    const keys = Object.keys(JSON.parse(config()));
    expect(keys).toEqual(["$schema", "statusLine", "guard", "gitHooks", "guidelines"]);
    writeFileSync(file(), "{}");
    ensure(dir);
    expect(JSON.parse(config())).toEqual(WRITTEN);
  });

  test("leaves a complete one byte for byte", () => {
    const text =
      `{"$schema":"x","guard":{},"statusLine":false,"gitHooks":{"pre-push":[]},"guidelines":true}`;
    writeFileSync(file(), text);
    expect(ensure(dir)).toEqual([]);
    expect(config()).toBe(text);
  });

  test("leaves one that isn't a JSON object", () => {
    for (const text of ["{", "[]", "null"]) {
      writeFileSync(file(), text);
      expect(ensure(dir)).toEqual([]);
      expect(config()).toBe(text);
    }
  });

  test("names an .about/ or .harness.json left below the root", () => {
    const app = join(dir, "app");
    mkdirSync(join(app, ".about"), { recursive: true });
    expect(ensure(app)).toEqual([
      "app/.about is ignored: the am plugin reads .about at the repo root",
      CREATED,
    ]);
    writeFileSync(join(app, ".harness.json"), "{}");
    expect(ensure(app)).toEqual([
      "app/.about is ignored: the am plugin reads .about at the repo root",
      "app/.harness.json is ignored: the am plugin reads .harness.json at the repo root",
    ]);
    expect(ensure(dir)).toEqual([]);
  });

  test("does nothing outside a git repo", () => {
    const outside = mkdtempSync(join(tmpdir(), "harness-config-"));
    expect(ensure(outside)).toEqual([]);
    expect(existsSync(join(outside, ".harness.json"))).toBe(false);
  });
});
