import { beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import schema from "../harness.schema.json";
import {
  BUILTINS,
  GIT_HOOKS,
  readConfig,
  repoRoot,
  SCHEMA,
  THRESHOLDS,
  WRITTEN,
} from "./config";

let dir: string;
const config = (value: unknown) => {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  writeFileSync(join(dir, ".harness.json"), text);
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "config-"));
});

describe("readConfig", () => {
  test("reads the config at the repo root from a folder inside it", () => {
    spawnSync("git", ["-C", dir, "init", "-q"]);
    mkdirSync(join(dir, "app"));
    writeFileSync(join(dir, "app", ".harness.json"), `{ "guidelines": true }`);
    expect(readConfig(join(dir, "app")).guidelines).toBe(false);
    config({ guidelines: true });
    const found = readConfig(join(dir, "app"));
    expect(found.guidelines).toBe(true);
    expect(found.root).toBe(repoRoot(join(dir, "app"))!);
    expect(found.root).toEndWith(dir.split("/").pop()!);
  });

  test("reads it from the folder itself outside a repo", () => {
    expect(repoRoot(dir)).toBeNull();
    config({ guidelines: true });
    expect(readConfig(dir)).toMatchObject({ root: dir, guidelines: true });
  });

  test("without a config, leaves the Git hooks and the Status line as they are", () => {
    expect(readConfig(dir)).toEqual({
      root: dir,
      guard: [],
      guidelines: false,
      sessionReview: false,
      problems: [],
    });
  });

  test("with a config that isn't a JSON object, the same, and says so", () => {
    for (const text of ["{", "[]", "null"]) {
      config(text);
      const found = readConfig(dir);
      expect(found.problems).toEqual([".harness.json isn't a JSON object; none of it applies"]);
      expect(found.gitHooks).toBeUndefined();
      expect(found.statusLine).toBeUndefined();
    }
  });

  test("the plugin's own config changes nothing and has no problems", () => {
    config(WRITTEN);
    expect(readConfig(dir)).toMatchObject({
      guard: [],
      gitHooks: new Map(),
      statusLine: false,
      guidelines: false,
      problems: [],
    });
  });

  test("reports a key that isn't a setting", () => {
    config({ statusline: true });
    expect(readConfig(dir).problems).toEqual([
      ".harness.json: statusline is not a setting; ignored",
    ]);
  });

  test("reports a flag that isn't a boolean, and uses its default", () => {
    config({ guidelines: "yes", sessionReview: 1 });
    expect(readConfig(dir)).toMatchObject({
      guidelines: false,
      sessionReview: false,
      problems: [
        ".harness.json: guidelines is not a boolean",
        ".harness.json: sessionReview is not a boolean",
      ],
    });
  });

  test("sessionReview follows the config, else whether .about/ exists", () => {
    expect(readConfig(dir).sessionReview).toBe(false);
    config({ sessionReview: true });
    expect(readConfig(dir).sessionReview).toBe(true);
    mkdirSync(join(dir, ".about"));
    config({});
    expect(readConfig(dir).sessionReview).toBe(true);
    config({ sessionReview: false });
    expect(readConfig(dir).sessionReview).toBe(false);
    config("{");
    expect(readConfig(dir).sessionReview).toBe(true);
  });
});

describe("guard", () => {
  test("keeps the well-formed blocks, and names the rest", () => {
    config({
      guard: {
        block: [
          { pattern: "\\bterraform destroy\\b", reason: "destroys infrastructure" },
          { pattern: "(", reason: "invalid regex" },
          { pattern: "x" },
          null,
        ],
      },
    });
    const { guard, problems } = readConfig(dir);
    expect(guard.map((b) => b.reason)).toEqual(["destroys infrastructure"]);
    expect(guard[0]!.pattern.test("cd infra && terraform destroy")).toBe(true);
    expect(problems).toEqual([
      ".harness.json: guard.block[1].pattern is not a regular expression; ignored",
      ".harness.json: guard.block[2] needs a pattern and a reason; ignored",
      ".harness.json: guard.block[3] needs a pattern and a reason; ignored",
    ]);
  });

  test("has no extra blocks without them, or when they aren't a list", () => {
    config({ guard: {} });
    expect(readConfig(dir)).toMatchObject({ guard: [], problems: [] });
    config({ guard: { block: "x" } });
    expect(readConfig(dir)).toMatchObject({
      guard: [],
      problems: [".harness.json: guard is not { block: [{ pattern, reason }] }; no extra blocks"],
    });
  });
});

describe("gitHooks", () => {
  test("takes commands and Built-in checks under their own Git hook", () => {
    config({
      gitHooks: {
        "commit-msg": ["am:conventional-commits", "am:no-ai-coauthor"],
        "pre-commit": ["bun run check"],
        "pre-push": [],
      },
    });
    const { gitHooks, problems } = readConfig(dir);
    expect(problems).toEqual([]);
    expect([...gitHooks!.keys()]).toEqual(["commit-msg", "pre-commit", "pre-push"]);
    expect(gitHooks!.get("pre-commit")).toEqual(["bun run check"]);
  });

  test("with any mistake, leaves the Git hooks as they are, naming each", () => {
    const left = (e: string) => `.harness.json: ${e}; Git hooks left as they are`;
    config({ gitHooks: [] });
    expect(readConfig(dir)).toMatchObject({ problems: [left("gitHooks is not an object")] });
    config({
      gitHooks: {
        "post-merge": ["x"],
        "pre-commit": "bun test",
        "commit-msg": ["am:linear-history", "am:nope"],
        "pre-push": [""],
      },
    });
    const found = readConfig(dir);
    expect(found.gitHooks).toBeUndefined();
    expect(found.problems).toEqual([
      left("post-merge is not a supported Git hook (pre-commit, commit-msg, pre-push)"),
      left("pre-commit is not a list of commands"),
      left("am:linear-history belongs to pre-push, not commit-msg"),
      left("am:nope is not a Built-in check"),
      left("pre-push is not a list of commands"),
    ]);
  });
});

describe("statusLine", () => {
  test("is off unless switched on, with the default thresholds for true", () => {
    config({});
    expect(readConfig(dir).statusLine).toBe(false);
    config({ statusLine: true });
    expect(readConfig(dir).statusLine).toEqual(THRESHOLDS);
  });

  test("takes the thresholds the config sets, and the defaults for the rest", () => {
    config({ statusLine: { context: { red: 30 }, sevenDay: { red: 100 } } });
    expect(readConfig(dir)).toMatchObject({
      problems: [],
      statusLine: {
        ...THRESHOLDS,
        context: { yellow: 15, red: 30 },
        sevenDay: { yellow: 80, red: 100 },
      },
    });
    expect(THRESHOLDS.context.red).toBe(20);
  });

  test("uses the defaults in place of wrong thresholds, and names each", () => {
    config({
      statusLine: {
        week: {},
        fiveHour: 5,
        sevenDay: { blue: 1, red: "x", yellow: 101 },
        context: { yellow: 20, red: 15 },
      },
    });
    expect(readConfig(dir)).toMatchObject({
      statusLine: THRESHOLDS,
      problems: [
        "statusLine.week is not a bar (context, fiveHour, sevenDay); ignored",
        "statusLine.fiveHour is not an object of yellow and red; the defaults are used",
        "statusLine.sevenDay.blue is not yellow or red; ignored",
        "statusLine.sevenDay.red is not a percentage from 0 to 100; the default is used",
        "statusLine.sevenDay.yellow is not a percentage from 0 to 100; the default is used",
        "statusLine.context: yellow (20) is above red (15); the defaults are used",
      ].map((p) => `.harness.json: ${p}`),
    });
  });

  test("of the wrong type, leaves the Status line as it is", () => {
    for (const value of ["yes", [], 1]) {
      config({ statusLine: value });
      const found = readConfig(dir);
      expect(found.statusLine).toBeUndefined();
      expect(found.problems).toEqual([
        ".harness.json: statusLine is not true, false or an object of thresholds",
      ]);
    }
  });
});

describe("the schema", () => {
  test("describes exactly the settings read, and the config written points at it", () => {
    expect(Object.keys(schema.properties).sort()).toEqual(
      [...Object.keys(WRITTEN), "sessionReview"].sort(),
    );
    expect(WRITTEN.$schema).toBe(SCHEMA);
    expect(SCHEMA).toEndWith("/plugins/am/harness.schema.json");
    expect(schema.properties.guidelines.type).toBe("boolean");
    expect(schema.properties.sessionReview.type).toBe("boolean");
  });

  test("lists the Git hooks and each one's Built-in checks", () => {
    const props = schema.properties.gitHooks.properties;
    expect(Object.keys(props)).toEqual([...GIT_HOOKS]);
    const listed = GIT_HOOKS.map((h) => props[h].items.anyOf[0]!.enum!.map((c) => [c, h]));
    expect(listed.flat()).toEqual(Object.entries(BUILTINS).map(([c, h]) => [`am:${c}`, h]));
  });

  test("lists the Status line's bars", () => {
    expect(schema.properties.statusLine.oneOf[0]).toEqual({ type: "boolean" });
    expect(Object.keys(schema.properties.statusLine.oneOf[1]!.properties ?? {})).toEqual(
      Object.keys(THRESHOLDS),
    );
  });
});
