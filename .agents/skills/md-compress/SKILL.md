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

## Direct transaction contract

This table applies only when `md-compress` is invoked directly. An explicit
AIDLC compression-session packet means the AIDLC closeout boundary already
performed `begin`; in that context do not invoke this table's `begin` command.

| Context | Owner | Preconditions | Assistant action | Script result | Prohibited action |
| --- | --- | --- | --- | --- | --- |
| Direct durable Markdown edit | `md-compress` | No AIDLC compression-session packet; one eligible `<absolute-markdown-path>`. | Run `begin` once. | Returns source, temporary backup/lock paths, and one exact `finalize` action. | Do not capture KB knowledge, use dynamic execution, or edit backup/lock files. |
| Between returned actions | Assistant | A successful direct `begin` packet. | Edit only the returned source path in this session. | No script runs during this edit. | Do not start another transaction or change its arguments. |
| Final direct validation | `md-compress` | The exact `finalize` action returned by `begin`. | Run it once after the edit. | Validates protected tokens, removes temp files, returns `done`. | Do not manually remove or move temporary files. |

Use fixed-arity typed calls, never an inline filesystem program:

```text
bun <agents-root>/scripts/md-compress.ts begin <markdown-path>
```

`begin` writes the backup and lock under the system temporary directory,
`tmpdir()/aidlc-md-compress`, and returns the exact `finalize` action. Edit only
the selected Markdown in the same agent session. Then run the returned action:

```text
bun <agents-root>/scripts/md-compress.ts finalize <markdown-path>
```

`finalize` reads the temporary backup, verifies protected Markdown tokens are
preserved, and removes both temporary files only after validation succeeds. If
it fails, keep the source and temporary backup for repair; do not delete or move
either manually.

Do not compress a temporary AIDLC intent unless the user explicitly asks to
retain it. For standalone durable KB capture, `knowledge-base` hands off to the
direct route above. For an AIDLC durable closeout, the AIDLC boundary returns
the session packet after `capture-and-begin`; it owns the guard and later
`finalize-and-recover`, while this skill must not begin another transaction.
