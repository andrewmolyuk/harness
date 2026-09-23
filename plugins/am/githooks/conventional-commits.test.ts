import { describe, expect, test } from "bun:test";
import { check } from "./conventional-commits";

describe("check", () => {
  const valid = [
    "feat: add guard",
    "fix(adr): correct a date",
    "feat!: drop node",
    "refactor(hooks/guard)!: split parse\n\nBody.",
    "Feat: any case",
    "FIX(Parser): any case",
    "wip: any type",
    "feat(multi word): a scope with spaces",
    "# Please enter the commit message\n\ndocs: explain config",
    "Merge branch 'main' into feature",
    'Revert "feat: add guard"',
    "fixup! feat: add guard",
    "squash! feat: add guard",
    "feat: x\n# a comment\n\nBody.",
    "feat: x\n# ------------------------ >8 ------------------------\ndiff --git a b",
    "feat: x\n\nBody.\n\nBREAKING CHANGE: drops node",
    "feat: x\n\nBREAKING-CHANGE: drops node\nRefs: #12",
    "",
  ];
  for (const message of valid) test(`accepts ${JSON.stringify(message)}`, () => {
    expect(check(message)).toBeNull();
  });

  const invalid = ["add guard", "fix bug: x", "feat:add guard", "feat:  x", "feat(): x",
    "feat (a): x", "feat: "];
  for (const message of invalid) test(`rejects ${JSON.stringify(message)}`, () => {
    expect(check(message)).toContain(message);
  });

  test("rejects a body right below the subject", () => {
    expect(check("feat: x\nBody.")).toBe(`leave a blank line between "feat: x" and the body`);
  });

  const footers = ["Breaking change: x", "breaking-change: x", "BREAKING CHANGE:x",
    "BREAKING CHANGE : x"];
  for (const footer of footers) test(`rejects the footer ${footer}`, () => {
    expect(check(`feat: x\n\n${footer}`)).toBe(
      `"${footer}" is not \`BREAKING CHANGE: description\``,
    );
  });
});
