import { describe, expect, test } from "bun:test";
import { check } from "./no-ai-coauthor";

describe("check", () => {
  const ai = [
    "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>",
    "Co-authored-by: Claude <noreply@anthropic.com>",
    "co-authored-by: Claude Code <x@y.z>",
    "Co-authored-by: Copilot <175728472+Copilot@users.noreply.github.com>",
    "Co-authored-by: Cursor Agent <cursoragent@cursor.com>",
    "Co-authored-by: Codex <codex@openai.com>",
  ];
  for (const trailer of ai) test(`rejects ${trailer}`, () => {
    expect(check(`feat: x\n\nBody.\n\n${trailer}\n`)).toEqual([trailer]);
  });

  const human = [
    "Co-authored-by: Jane Doe <jane@example.com>",
    "Co-authored-by: Claude Dupont <claude@example.fr>",
  ];
  for (const trailer of human) test(`accepts ${trailer}`, () => {
    expect(check(`feat: x\n\n${trailer}\n`)).toEqual([]);
  });

  test("ignores the diff below the scissors line", () => {
    const message = "feat: x\n# ------------------------ >8 ------------------------\n" +
      "+Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n" +
      "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n";
    expect(check(message)).toEqual([]);
  });

  test("ignores a mention outside a trailer", () => {
    expect(check("docs: say Claude Code wrote nothing\n")).toEqual([]);
  });
});
