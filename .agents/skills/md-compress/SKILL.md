---
name: md-compress
description: Losslessly distill durable Markdown while preserving protected Markdown tokens and a verified backup.
argument-hint: "begin|finalize <absolute-markdown-path>"
---

# Markdown Compression

## 1. Role & Scope

This skill owns the lossless guard, compression, and finalization transaction
for durable Markdown that will be loaded again. It reduces redundant prose
while preserving executable/cited tokens and a verified source. It rejects
sensitive paths, raw private configuration, non-Markdown files, and work
outside the current agent session.
Intentional protected-token removal is allowed only through an explicit
authorization manifest that records the exact token and a reviewable
justification.

## 2. Usage

```text
/md-compress begin <absolute-markdown-path> # guard one Markdown source before editing
/md-compress finalize <absolute-markdown-path> # validate protected tokens and close the guard
```

The finalize command may additionally receive one removal-authorization JSON
path when the edit intentionally removes protected tokens.

The unannotated grammar is:

```text
/md-compress begin <absolute-markdown-path>
/md-compress finalize <absolute-markdown-path>
```

Run `begin` before editing one eligible Markdown source, edit only the returned
source, then run the exact returned `finalize` action.

## 3. Immutable Operational Rules

- Begin the guard before editing and use only the returned source path and exact
  finalize action. Do not start another transaction for the same source.
- Preserve code fences, URLs, inline code, links, frontmatter, and other
  protected Markdown tokens exactly unless each removed token is covered by a
  valid removal-authorization manifest. Never edit the backup or lock.
- Do not call a provider API, model subprocess, dynamic execution, or external
  dependency. **Refuse sensitive paths**, non-Markdown files, raw private
  configuration, and paths not owned by the active session.
- Stop on guard or finalization failure and retain the backup/lock for repair;
  do not manually remove temporary files.

## 4. Input & Context Schema

- **Required:** One absolute eligible durable Markdown path.
- **Optional:** A caller-supplied compression-session packet that already owns
  `begin` and returns the exact `finalize` action.
- **Context:** Source content, temporary backup/lock under `tmpdir()`,
  protected-token snapshot, current-session identity, returned action, and
  optional removal authorization.
- **Unknowns:** Sensitive, missing, ineligible, changed-session, or externally
  modified paths are explicit stops. The source is never guessed.

## 5. Ordered Execution Chain

```text
eligible source -> begin guard -> protected edit -> exact finalize
                -> token validation -> done receipt or preserved recovery
```

1. **Intake:** Validate the absolute path and eligibility. In a direct call,
   begin the protected transaction; with a valid caller packet, honor its
   existing guard and do not begin a second one.
2. **Edit:** Edit only the returned source path in the same session. Distill
   duplicate or no-op prose without altering protected tokens or changing the
   document's meaning.
3. **Finalize:** Execute the exact returned `finalize` action. If protected
   tokens were intentionally removed, provide a JSON manifest containing
   `sourcePath` and non-empty `removals` entries with `token`, one of the
   allowed `basis` values (`duplicate`, `false-positive`,
   `superseded-contract`, or `user-request`), and a substantive
   `justification`. The guard requires every removed token to be declared,
   rejects stale or unrelated declarations, then removes temporary files only
   after validation succeeds.
4. **Verify:** Require the `done` receipt and confirm the resulting source is
   still eligible and lossless. A compression receipt proves preservation, not
   the quality of an unrelated prose review.
5. **Stop or recover:** On failure, report the guard/finalization error and
   preserve the returned recovery state; repair only the selected source.

### Direct transaction contract

| Command or information | Arguments | When to use | Additional information |
| --- | --- | --- | --- |
| `begin` | `<absolute-markdown-path>` | Direct durable Markdown edit with one eligible source and no caller packet | `bun <agents-root>/scripts/md-compress.ts begin "<absolute-markdown-path>"`; returns source, backup/lock, and one exact `finalize` action. |
| `edit` | `<returned-source-path>` | Between the returned `begin` and `finalize` actions | Do not start another transaction or change arguments; make only the protected edit. |
| `finalize` | `<absolute-markdown-path>` | Final validation using the exact action returned by `begin` | `bun <agents-root>/scripts/md-compress.ts finalize "<absolute-markdown-path>"`; validates protected tokens, removes temporary files, and returns `done`. |

The removal-authorization manifest is a JSON object with this shape:

```json
{
  "sourcePath": "<absolute-markdown-path>",
  "removals": [
    {
      "basis": "<duplicate|false-positive|superseded-contract|user-request>",
      "justification": "<why this exact protected token is intentionally removed>",
      "token": "<exact protected Markdown token>"
    }
  ]
}
```

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

## 6. Output & Completion Contract

Success returns a losslessly compressed eligible source and a `done`
finalization receipt. Protected-token validation, any explicit removal
authorization, and the owner-managed removal of verified temporary files
establish proof. A smaller file or clean-looking prose alone is not proof.

Failure names the rejected path, guard state, protected-token mismatch, or
finalization error and preserves recovery state. Do not claim completion while
the backup/lock remains required for repair.

## 7. Evaluation Anchors

- **Canonical:** `begin` returns one source and exact `finalize`; the source is
  edited in-session and finalization returns `done` after preserving a code
  fence and URL.
- **Boundary:** A sensitive path, non-Markdown file, altered backup, or changed
  session is rejected and retained for recovery.
- **Challenge:** A failed finalization does not trigger manual cleanup or a
  second transaction; the backup remains available to repair the source.
- **Independent verifier:** Protected-token comparison, finalization receipt,
  and eligibility checks independently verify preservation.
