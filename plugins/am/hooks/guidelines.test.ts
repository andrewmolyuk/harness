import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { index } from "./guidelines";

const ROOT = resolve(import.meta.dir, "..");

describe("index", () => {
  test("has the plugin's path in place, naming files that exist", () => {
    const out = index();
    expect(out).toStartWith("# am guidelines");
    expect(out).not.toContain("${CLAUDE_PLUGIN_ROOT}");
    const named = [...out.matchAll(/`([^`]+\.md)`/g)].map((m) => m[1]);
    expect(named).toContain(join(ROOT, "guidelines", "principles.md"));
    for (const file of named) expect(existsSync(file)).toBe(true);
  });
});
