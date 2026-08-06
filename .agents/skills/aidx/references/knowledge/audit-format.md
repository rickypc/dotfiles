# AIDX audit format

The goal record's **Audit** section is append-only context for a state event.
Typed gray-matter metadata and the state helper are authoritative; audit text
must never alter them.

## Event vocabulary

Use one of these concise event names when it fits:

- `context-inspected`
- `questions-recorded`
- `plan-generated`
- `plan-revised`
- `plan-approved`
- `execution-recorded`
- `tests-failed`
- `repair-recorded`
- `tests-passed`
- `lesson-recorded`
- `blocked`
- `deferred`

## Entry format

```text
- 2026-08-01T00:00:00.000Z — plan-approved — User explicitly approved Plan v1.
```

Each entry needs an ISO timestamp, a concise event, and factual evidence. Do
not record secrets, private knowledge-base content, raw tool transcripts,
invented events, session markers, or assistant-native hook data.

## Audit rules

- Persist the state transition before reporting it.
- Put detailed evidence in the owning goal section; keep the audit a concise
  chronological pointer.
- A re-plan supersedes the previous plan version and requires approval again.
- Closeout requires validation evidence and an explicit lesson disposition.
