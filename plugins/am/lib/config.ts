// The project's Harness config, .harness.json (ADR 0004, 0007, 0009, 0011); harness.schema.json
// at the plugin root describes it.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type Config = Record<string, unknown>;

// The parsed config, or null when the project has none. Throws when it isn't a JSON object.
export function load(dir: string): Config | null {
  const file = join(dir, ".harness.json");
  if (!existsSync(file)) return null;
  const config: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (!config || typeof config !== "object" || Array.isArray(config))
    throw new Error(".harness.json is not a JSON object");
  return config as Config;
}
