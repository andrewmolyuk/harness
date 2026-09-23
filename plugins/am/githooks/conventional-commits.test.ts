import { describe, expect, test } from "bun:test";
import { check } from "./conventional-commits";

describe("check", () => {
  const valid = [
    "feat: add guard",
    "fix(adr): correct a date",
    "feat!: drop node",
    "refactor(hooks/guard)!: split parse\n\nBody.",
    "# Please enter the commit message\n\ndocs: explain config",
    "Merge branch 'main' into feature",
    'Revert "feat: add guard"',
    "fixup! feat: add guard",
    "squash! feat: add guard",
    "",
  ];
  for (const message of valid) test(`accepts ${JSON.stringify(message)}`, () => {
    expect(check(message)).toBeNull();
  });

  const invalid = ["add guard", "feature: add guard", "feat:add guard", "feat(): x", "Feat: x"];
  for (const message of invalid) test(`rejects ${JSON.stringify(message)}`, () => {
    expect(check(message)).toContain(message);
  });
});
