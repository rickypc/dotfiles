# Build and Test

Run real behavior tests, required coverage, Biome, TypeScript where applicable,
and project gates. When the selected package exposes it, `bun run test` is the
mandatory default aggregate gate. Run it after all targeted checks and record
the exact receipt as `bun run test: passed (exit 0)`. Use another gate only
when the intent records the explicit project-specific exception before
validation. Repair failures or report the exact blocker; never invent a pass.
