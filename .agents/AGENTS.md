# Universal assistant runtime

This directory is the machine-wide assistant runtime for projects that do not
ship their own `.agents/skills/aidlc`. A project-local skill always takes
precedence over this global one.

- Use `skills/aidlc/SKILL.md` for lifecycle work; do not copy or fork its
  runtime into a project.
- Use `skills/codebase-memory/SKILL.md` for code discovery and
  `skills/knowledge-base/SKILL.md` for external private knowledge. Do not
  bypass either with independent CBM, MCP, CLI, or grep calls.
- Universal executable scripts live in `scripts/`; reusable TypeScript lives in
  `utils/`. Do not add a global `tools/` directory or platform-specific hooks.
- Temporary workflow intents are centralized at
  `aidlc/<cbm-index>/intents/<id>.md` and must be read/written through the
  gray-matter-based AIDLC scripts.
- During ordinary work, treat all of `.agents` as read-only except that one
  temporary-intent namespace. Do not edit, create, delete, or move runtime
  assets. The user must explicitly request an exact runtime asset change; the
  canonical boundary is in `aidlc/protocols/runtime.md`.
## Skill catalog

Resolve a project-local skill before this global catalog. Invoke a skill when
its selection rule applies; do not probe its scripts with `--help` when the
skill already supplies the command contract.

| Skill | Required input or command arguments | Use when |
| --- | --- | --- |
| `aidlc` | `start ~/.agents <absolute-project-root> "<summary>" [--ui]` | A code change needs the four-phase intent, approval, one final gate, and KB closeout route. |
| `codebase-memory` | `discover "<approved-root>" "<cbm-index>" "<query>"` | Any code, symbol, call-path, architecture, or code-text discovery is needed. |
| `knowledge-base` | `search "<private-kb-root>" "<kb-cbm-index>" "<query>"` | A private-KB decision, policy, prior lesson, capture, or OKF validation is needed. |
| `biome-tsc-checker` | `<path> [<path>...]` | Explicit JavaScript or TypeScript paths need Biome, strict TypeScript, and declaration-order checks. |
| `bun-test-generator` | One SUT plus `<all>`, a method list, or a method range | A selected JavaScript/TypeScript unit needs quality-focused Bun tests or an existing Jest test must be converted. |
| `content-writer` | Objective, audience, format, constraints, and citation style | Research-backed content must be drafted, refreshed, or validated. |
| `md-compress` | One durable Markdown path | Durable Markdown needs lossless compression with a verified backup. |
| `skill-manager` | One selected skill and its requested change | A skill needs to be created, reviewed, renamed, synchronized, optimized, or validated. |

`knowledge-base` alone owns the private-KB root. `codebase-memory` alone owns
CBM command selection and fallback search. The arguments above are the public
starting contracts; read the selected skill before running its complete flow.

## Code changes

This policy applies to every code-related change, whether or not AIDLC is in
use.

- Make the minimum change that satisfies the verified requested behavior; do
  not broaden the patch for nearby cleanup, refactoring, or style preference.
- Reuse existing project code, types, patterns, configuration, and test helpers
  when they fit the requested behavior. Add a new abstraction only when the
  verified extension point cannot support it clearly.
- Remove code, tests, configuration, documentation, and references made dead
  by this change. Do not leave duplicate implementations, obsolete branches,
  unreachable paths, or stale commands behind.
- Do not remove pre-existing dead code that this change did not create or
  replace on assumption. Report the exact evidence and ask the user whether to
  include that separate cleanup.
