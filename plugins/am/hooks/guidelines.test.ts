import { beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import schema from "../harness.schema.json";
import { guidelines } from "./guidelines";

const ROOT = resolve(import.meta.dir, "..");

describe("guidelines", () => {
  let dir: string;
  const config = (value: unknown) =>
    writeFileSync(join(dir, ".harness.json"), JSON.stringify(value));

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "guidelines-"));
  });

  test("the schema allows it", () => {
    expect(schema.properties.guidelines.type).toBe("boolean");
  });

  test("does nothing without .harness.json, without the key or when it is false", () => {
    expect(guidelines(dir)).toBe("");
    config({});
    expect(guidelines(dir)).toBe("");
    config({ guidelines: false });
    expect(guidelines(dir)).toBe("");
  });

  test("prints the index with the plugin's path in place", () => {
    config({ guidelines: true });
    const out = guidelines(dir);
    expect(out).toStartWith("# am guidelines");
    expect(out).toContain(`\`${ROOT}/guidelines/principles.md\``);
    expect(out).not.toContain("${CLAUDE_PLUGIN_ROOT}");
  });

  test("every Guideline file the index names exists", () => {
    config({ guidelines: true });
    const named = [...guidelines(dir).matchAll(/`([^`]+\.md)`/g)].map((m) => m[1]);
    expect(named.length).toBeGreaterThan(0);
    for (const file of named) {
      expect(file).toStartWith(ROOT);
      expect(existsSync(file)).toBe(true);
    }
  });

  test("reports a value that isn't a boolean, or a broken config", () => {
    config({ guidelines: "yes" });
    expect(guidelines(dir)).toBe("am guidelines:\n.harness.json: guidelines is not a boolean");
    writeFileSync(join(dir, ".harness.json"), "[]");
    expect(guidelines(dir)).toContain("guidelines not loaded");
  });
});
