# Reading project and knowledge rules

## Authority order

1. The user's current request and explicit approval.
2. Project-local instructions and a project-local AIDLC skill, when present.
3. The selected project's observed conventions and configured final gate.
4. Validated concepts selected by knowledge-base. Organization and team
   practices retain their precedence; a project practice may live in any
   `<cbm-index>/<subject>/<concept>.md` subject.
5. This committed universal methodology.

No AGENTS file, intent, or global reference directory may select or override
the private KB root. knowledge-base alone does that.

## Read protocol

- Read the user and applicable project instructions before planning.
- Before committing Approval Handoff, ask knowledge-base to select only
  concepts that materially affect the change, then use the canonical AIDLC
  command-catalog row for approval with validated context. The shared context
  utility validates allowed concept scopes and parses their OKF frontmatter.
  The separate context script is recovery-only for older already-approved
  intents.
- Use /codebase-memory for code facts. It has its own staged fallback; do not
  invoke CBM, MCP, CLI, grep, or a path guess directly.
- Treat a concept's `ALWAYS` or `NEVER` rule as a constraint. Conflicting
  rules are an error from the resolver, not a precedence decision for the
  model to invent.

## Empty and missing context

No resolved KB concept means no affirmed external rule, not a default policy.
Record that fact and continue. Do not create placeholder organization, team,
or project records; do not copy private content into the temporary intent or
committed global knowledge.

## Conflict handling

When user, project, code, and KB evidence disagree, retain the source and
describe the conflict. Ask for a decision when it changes scope, behavior,
safety, implementation, or validation. Otherwise follow the higher authority
and state why.
