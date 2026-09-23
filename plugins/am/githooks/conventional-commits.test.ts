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
    "i18n: digits in the type",
    "feat: x\n\nBreaking change: a body line, not a footer.\n\nRefs: #1",
    "feat(multi word): a scope with spaces",
    "# Please enter the commit message\n\ndocs: explain config",
    "Merge branch 'main' into feature",
    'Revert "feat: add guard"',
    'Reapply "feat: add guard"',
    "Merge pull request #7 from a/b",
    "Merge remote-tracking branch 'origin/main'",
    "fixup! feat: add guard",
    "squash! feat: add guard",
    "feat: x\n# a comment\n\nBody.",
    "feat: x\n# ------------------------ >8 ------------------------\ndiff --git a b",
    "feat: x\n\nBody.\n\nBREAKING CHANGE: drops node",
    "feat: x\n\nBREAKING-CHANGE: drops node\nRefs: #12",
    "feat: x\n\nBreaking change: not a token, so a body line",
    "feat: x\n\nRefs: #1\nbreaking change: part of the Refs value",
    "feat: x\n\nReviewed-by: Z\nCloses #42",
    "",
  ];
  for (const message of valid) test(`accepts ${JSON.stringify(message)}`, () => {
    expect(check(message)).toBeNull();
  });

  const invalid = ["add guard", "fix bug: x", "feat:add guard", "feat:  x", "feat(): x",
    "feat( ): x", "feat (a): x", "feat: ", "Merge sort for the index"];
  for (const message of invalid) test(`rejects ${JSON.stringify(message)}`, () => {
    expect(check(message)).toContain(message);
  });

  // The examples in the Conventional Commits 1.0.0 specification.
  const spec = [
    "feat: allow provided config object to extend other configs\n\nBREAKING CHANGE: `extends` " +
      "key in config file is now used for extending other config files",
    "feat!: send an email to the customer when a product is shipped",
    "feat(api)!: send an email to the customer when a product is shipped",
    "feat!: drop support for Node 6\n\nBREAKING CHANGE: use JavaScript features not available " +
      "in Node 6.",
    "docs: correct spelling of CHANGELOG",
    "feat(lang): add Polish language",
    "fix: prevent racing of requests\n\nIntroduce a request id and a reference to latest " +
      "request. Dismiss\nincoming responses other than from latest request.\n\nRemove " +
      "timeouts which were used to mitigate the racing issue but are\nobsolete now.\n\n" +
      "Reviewed-by: Z\nRefs: #123",
    "revert: let us never again speak of the noodle incident\n\nRefs: 676104e, a215868",
  ];
  for (const message of spec) test(`accepts the spec's ${message.split("\n")[0]}`, () => {
    expect(check(message)).toBeNull();
    expect(check(`${message.replaceAll("\n", "\r\n")}\r\n`)).toBeNull();
  });

  test("rejects a body right below the subject", () => {
    expect(check("feat: x\nBody.")).toBe(`leave a blank line between "feat: x" and the body`);
  });

  const footers = ["Breaking-Change: x", "breaking-change: x", "BREAKING CHANGE #12",
    "BREAKING-CHANGE #12"];
  for (const footer of footers) test(`rejects the footer ${footer}`, () => {
    expect(check(`feat: x\n\nRefs: #1\n${footer}`)).toBe(
      `"${footer}" is not \`BREAKING CHANGE: description\``,
    );
  });

  test("reads footers across blank lines", () => {
    expect(check("feat: x\n\nBody.\n\nbreaking-change: y\n\nRefs: #1")).toBe(
      `"breaking-change: y" is not \`BREAKING CHANGE: description\``,
    );
  });
});
