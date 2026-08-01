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
