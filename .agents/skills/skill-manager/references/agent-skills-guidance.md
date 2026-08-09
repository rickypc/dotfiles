# Agent Skills creation guidance

Load this reference when designing or reviewing a skill package, its
description, evals, or scripts. It distills the Agent Skills specification and
creation guidance into the checks Skill Manager applies; the linked sources are
the authority for changes in the upstream guidance.

## Package and `SKILL.md` contract

- A skill is a directory with a required `SKILL.md`; `scripts/`, `references/`,
  and `assets/` are optional resource directories.
- YAML frontmatter requires `name` and `description`. `name` is 1–64
  characters, lowercase letters/numbers/hyphens only, has no leading/trailing
  or consecutive hyphens, and matches the directory. `description` is
  1–1,024 characters and states both the job and when to use it.
- Keep the body below 500 lines and approximately 5,000 tokens. Use relative
  skill-root paths, keep resource links one level deep, and move branch-only
  detail into focused references for progressive disclosure.
- `description` is the activation mechanism. A separate `trigger` frontmatter
  field is not part of skill selection and must not become a second trigger
  owner. Preserve `argument-hint` only when the host uses it for caller/UI
  guidance; it does not affect whether the skill loads.
- Optional metadata is only useful when the client needs it. Treat
  `compatibility` and experimental `allowed-tools` as explicit, bounded
  contracts rather than defaults.

## Creation and description practice

- Ground a skill in real tasks, project artifacts, corrections, edge cases,
  and execution traces. Refine from all observed results, including wasted
  steps and false positives; omit generic knowledge the agent already has.
- Keep a coherent scope, moderate detail, and defaults with brief escape
  hatches. Match specificity to fragility, favor reusable procedures, and put
  non-obvious gotchas inline where the agent will encounter them.
- Write descriptions imperatively around user intent, not implementation.
  Include indirect contexts and useful keywords, define adjacent boundaries,
  and prefer concise trigger guidance over a feature inventory.
- Evaluate descriptions with roughly 20 realistic prompts when practical,
  balanced between should-trigger and should-not-trigger cases. Keep the
  maintained set in `evals/trigger-queries.json`. Vary phrasing, explicitness,
  detail, complexity, paths, casual language, and typos. Prefer near-miss
  negatives over obviously unrelated prompts.
- A trigger eval passes when a should-trigger prompt loads the skill and a
  should-not-trigger prompt does not. Test through the actual registered agent
  client and its observable skill-load signal, not by keyword matching the
  description. Run each query three times where supported; compute trigger rate
  and use 0.5 as a reasonable default threshold for both classes.
- Run each prompt repeatedly where supported and record trigger rates. Keep a
  fixed mixed train/validation split (about 60/40); use only train failures to
  guide revisions, avoid copying failed-query keywords, and select the best
  generalizing iteration by validation performance. Recheck the 1,024-character
  limit after every revision. Keep both classes represented in each split and
  use fresh queries after optimization as a final generalization check.

## Output evaluation practice

- Start with a small set of realistic prompts and expected outcomes, varying
  phrasing and including at least one malformed, unusual, or ambiguous input.
  Run each case in a clean context with the skill and without it (or against a
  prior version), retaining outputs and timing data such as tokens and duration.
- Add assertions after observing the first outputs. Make them observable,
  countable, and resilient to equivalent wording; do not use vague quality
  claims or brittle exact phrases. Grade each assertion with concrete evidence.
- Use deterministic scripts for mechanical checks and human review for style,
  visual quality, usability, unexpected omissions, and whether the output fits
  the request. Blind comparison is useful for holistic comparison of versions.
- Aggregate pass rate, time, token cost, and variance. Remove assertions that
  always pass or fail in both configurations; investigate flakiness and
  outliers by reading the full execution trace. Keep eval evidence separate
  from deterministic package validation and closure proof.

## Script practice

- Use a one-off command when an existing package already solves the task. Bundle
  repeated or fragile logic in `scripts/` and reference it with a relative path
  from the skill root. Keep scripts self-contained or document dependencies;
  pin versions when reproducibility matters.
- Scripts must be non-interactive: accept inputs through arguments,
  environment, or stdin. Provide concise `--help` usage, examples, and flags.
  Emit structured JSON/CSV/TSV where composition matters.
- Errors should say what failed, what was expected, what was received when
  useful, and what the agent should try next. Handle edge cases explicitly and
  avoid hidden state or commands that can hang an agent.

## Sources

- [Agent Skills specification](https://agentskills.io/specification)
- [Best practices for skill creators](https://agentskills.io/skill-creation/best-practices)
- [Optimizing skill descriptions](https://agentskills.io/skill-creation/optimizing-descriptions)
- [Evaluating skill output quality](https://agentskills.io/skill-creation/evaluating-skills)
- [Using scripts in skills](https://agentskills.io/skill-creation/using-scripts)
