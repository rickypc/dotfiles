---
name: md-compress
description: Losslessly distill durable Markdown while preserving protected Markdown tokens and a verified backup.
---

# Markdown Compression

Use only for durable Markdown that will be loaded again. Refuse sensitive paths,
non-Markdown files, and raw private configuration. Guard before any prose edit,
compress only in the current agent session, validate protected Markdown tokens
(code fences, URLs, and inline code), then remove the verified backup. Never
call a provider API, model subprocess, or dynamically evaluated Bun program.
The direct transaction table below is already ordered and its script actions
remain the sole command owner.

## Direct transaction contract

This table applies when `/md-compress` is invoked directly. If a caller supplies
an explicit compression-session packet, its guard already performed `begin`; in
that context do not invoke this table's `begin` command.

| Priority | Context | Owner | Preconditions | Command or action | Script result | Next | Prohibited action |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Direct durable Markdown edit | `/md-compress` | No caller compression-session packet; one eligible `<absolute-markdown-path>`. | `bun <agents-root>/scripts/md-compress.ts begin "<absolute-markdown-path>"` | Returns source, temporary backup/lock paths, and one exact `finalize` action. | Edit only the returned source path. | Do not capture KB knowledge, use dynamic execution, or edit backup/lock files. |
| 2 | Between returned actions | Assistant | A successful direct `begin` packet. | Edit only the returned source path in this session. | No script runs during this edit. | Execute only the returned finalize action. | Do not start another transaction or change its arguments. |
| 3 | Final direct validation | `/md-compress` | The exact `finalize` action returned by `begin`. | `bun <agents-root>/scripts/md-compress.ts finalize "<absolute-markdown-path>"` | Validates protected tokens, removes temp files, returns `done`. | Stop on `done`; repair only the returned source on failure. | Do not manually remove or move temporary files. |

Use fixed-arity typed calls, never an inline filesystem program:

```text
bun <agents-root>/scripts/md-compress.ts begin <markdown-path>
```

`begin` uses `tmpdir()` to write the backup and lock under the system temporary
directory, specifically the temporary compression directory, and returns the
exact `finalize` action. Edit only
the selected Markdown in the same agent session. Then run the returned action:

```text
bun <agents-root>/scripts/md-compress.ts finalize <markdown-path>
```

`finalize` reads the temporary backup, verifies protected Markdown tokens are
preserved, and removes both temporary files only after validation succeeds. If
it fails, keep the source and temporary backup for repair; do not delete or move
either manually.

Do not compress temporary runtime state unless the user explicitly asks to
retain it. For durable KB capture, `/knowledge-base` hands off to the direct
route above. When another caller returns a session packet after beginning the
guard, it owns the later recovery action and this skill must not begin another
transaction.
