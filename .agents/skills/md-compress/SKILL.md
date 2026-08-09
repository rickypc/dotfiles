---
name: md-compress
description: Losslessly distill durable Markdown while preserving protected Markdown tokens and a verified backup.
---

# Markdown Compression

## 1. Role & Scope

This skill owns the lossless guard, compression, and finalization transaction
for durable Markdown that will be loaded again. It reduces redundant prose
while preserving executable/cited tokens and a verified source. It rejects
sensitive paths, raw private configuration, non-Markdown files, and work
outside the current agent session.

## 2. Immutable Operational Rules

- Begin the guard before editing and use only the returned source path and exact
  finalize action. Do not start another transaction for the same source.
- Preserve code fences, URLs, inline code, links, frontmatter, and other
  protected Markdown tokens exactly. Never edit the backup or lock.
- Do not call a provider API, model subprocess, dynamic execution, or external
  dependency. **Refuse sensitive paths**, non-Markdown files, raw private
  configuration, and paths not owned by the active session.
- Stop on guard or finalization failure and retain the backup/lock for repair;
  do not manually remove temporary files.

## 3. Input & Context Schema

- **Required:** One absolute eligible durable Markdown path.
- **Optional:** A caller-supplied compression-session packet that already owns
  `begin` and returns the exact `finalize` action.
- **Context:** Source content, temporary backup/lock under `tmpdir()`,
  protected-token snapshot, current-session identity, and returned action.
- **Unknowns:** Sensitive, missing, ineligible, changed-session, or externally
  modified paths are explicit stops. The source is never guessed.

## 4. Ordered Execution Chain

1. **Intake:** Validate the absolute path and eligibility. In a direct call,
   begin the protected transaction; with a valid caller packet, honor its
   existing guard and do not begin a second one.
2. **Edit:** Edit only the returned source path in the same session. Distill
   duplicate or no-op prose without altering protected tokens or changing the
   document's meaning.
3. **Finalize:** Execute only the exact returned `finalize` action. It reads
   the backup, compares protected Markdown tokens, and removes temporary files
   only after validation succeeds.
4. **Verify:** Require the `done` receipt and confirm the resulting source is
   still eligible and lossless. A compression receipt proves preservation, not
   the quality of an unrelated prose review.
5. **Stop or recover:** On failure, report the guard/finalization error and
   preserve the returned recovery state; repair only the selected source.

### Direct transaction contract

| Priority | Context | Preconditions | Exact action | Result and next action |
| --- | --- | --- | --- | --- |
| 1 | Direct durable Markdown edit | One eligible absolute path and no caller packet | `bun <agents-root>/scripts/md-compress.ts begin "<absolute-markdown-path>"` | Returns source, backup/lock, and one exact `finalize` action; edit only the returned source. |
| 2 | Between returned actions | Successful `begin` in this session | Edit only the returned source path | Do not start another transaction or change arguments; run the returned finalize. |
| 3 | Final validation | The exact action returned by `begin` | `bun <agents-root>/scripts/md-compress.ts finalize "<absolute-markdown-path>"` | Validates protected tokens, removes temp files, and returns `done`. |

The script uses the operating system `tmpdir()` and prints the exact temporary
paths. The backup belongs in the temporary directory, never beside the durable
source. Never guess `/tmp`, `/private/tmp`, or a platform-specific location.

When another caller returns a `/md-compress` compression-session packet, honor
its exact source and finalize action. The direct forms are:

```text
bun <agents-root>/scripts/md-compress.ts begin <markdown-path>
```

```text
bun <agents-root>/scripts/md-compress.ts finalize <markdown-path>
```

The direct transaction accepts one eligible `<absolute-markdown-path>` and
hands off to `/knowledge-base` when a durable KB record is the caller's source.

## 5. Output & Completion Contract

Success returns a losslessly compressed eligible source and a `done`
finalization receipt. Protected-token validation and the owner-managed removal
of verified temporary files establish proof. A smaller file or clean-looking
prose alone is not proof.

Failure names the rejected path, guard state, protected-token mismatch, or
finalization error and preserves recovery state. Do not claim completion while
the backup/lock remains required for repair.

## 6. Evaluation Anchors

- **Canonical:** `begin` returns one source and exact `finalize`; the source is
  edited in-session and finalization returns `done` after preserving a code
  fence and URL.
- **Boundary:** A sensitive path, non-Markdown file, altered backup, or changed
  session is rejected and retained for recovery.
- **Challenge:** A failed finalization does not trigger manual cleanup or a
  second transaction; the backup remains available to repair the source.
- **Independent verifier:** Protected-token comparison, finalization receipt,
  and eligibility checks independently verify preservation.
