// Preloaded before every test (bunfig.toml): inside a Git hook, GIT_DIR and friends point at
// the outer repo, so a test's own git commands would act on it.
for (const key of Object.keys(process.env)) if (key.startsWith("GIT_")) delete process.env[key];
