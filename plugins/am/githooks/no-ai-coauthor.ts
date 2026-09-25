// Built-in check am:no-ai-coauthor (commit-msg): no Co-Authored-By trailer names an AI; human
// co-authors pass.
import { readFileSync } from "node:fs";

// A person called Claude passes; Claude the model is named with a model, Code or its email.
const AI = new RegExp(
  [
    String.raw`\bclaude (code|opus|sonnet|haiku|fable|\d)`,
    String.raw`@anthropic\.com`,
    String.raw`\bcopilot\b`,
    String.raw`\bcursor agent\b`,
    String.raw`@cursor\.(com|sh)`,
    String.raw`\bchatgpt\b`,
    String.raw`\bcodex\b`,
    String.raw`@openai\.com`,
    String.raw`\bgemini\b`,
    String.raw`\bdevin\b`,
    String.raw`\baider\b`,
  ].join("|"),
  "i",
);
const SCISSORS = /^# -+ >8 -+$/m; // `git commit -v` puts the diff below this line

// The AI co-author trailers in the message.
export function check(message: string): string[] {
  return message
    .split(SCISSORS)[0]!
    .split("\n")
    .filter((l) => /^co-authored-by:/i.test(l) && AI.test(l));
}

if (import.meta.main) {
  const found = check(readFileSync(process.argv[2]!, "utf8"));
  if (found.length) {
    console.error(`am:no-ai-coauthor: remove the AI co-author trailer:\n${found.join("\n")}`);
    process.exit(1);
  }
}
