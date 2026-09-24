import { expect, test } from "bun:test";

// The repo's Markdown and TypeScript stay within 100 characters a line, with no trailing spaces;
// a frontmatter `description` may run longer.
const ls = ["git", "ls-files", "-co", "--exclude-standard", "*.md", "*.ts"];
const files = Bun.spawnSync(ls).stdout.toString().split("\n");

test.each(files.filter(Boolean))("%s", async (file) => {
  const bad = (await Bun.file(file).text()).split("\n").flatMap((line, i) =>
    / $/.test(line) ? [`${i + 1}: trailing space`]
    : line.length > 100 && !line.startsWith("description:") ? [`${i + 1}: ${line.length} chars`]
    : []);
  expect(bad).toEqual([]);
});
