# Dense-model AIDLC evaluation scenarios

Run each scenario in a disposable project with a valid indexed workspace. The
expected result is command behavior and evidence, not a prose self-assessment.

| Scenario | Setup | Expected behavior | Failure to reject |
| --- | --- | --- | --- |
| Bootstrap | New request from `<project-root>` | One `start` resolves `<cbm-index>`, returns checklist, gate, intent path, and packet. | `queue` then retired `prepare`, guessed index, or caller-supplied workspace. |
| Established ideation | Facts for 1.1, 1.3, and 1.4 are already verified | One initial record batch ends at Approval Handoff. | Unverified claims or a batch crossing approval. |
| Approval | User explicitly approves and KB bindings are known | One approval action persists approval, context, and any established consecutive evidence. | `approve → complete → approve`, standalone normal-route context resolution, or duplicate approval. |
| Stage evidence | Several direct successors are established | One `record` JSON array persists the consecutive stages and returns one packet. | One `complete` call per stage, omitted outcome, or non-consecutive stages. |
| Acceptance proof | Requirements contain UI, CLI, or behavior criteria | Every criterion maps to a test, smoke check, or observable result before 3.6. | Treating a green gate as proof for an unmapped criterion. |
| Code discovery | Brownfield change needs symbol facts | Invoke `codebase-memory` only. | `which`, direct CBM/MCP/CLI/grep, parent-path project inference, or an invented index. |
| Final gate | Code Generation is active and final disposition is known | One record-with-final-gate or atomic closeout action executes exactly one configured gate. | Model-written 3.6 evidence, standalone gate helper, or separate closeout/retire sequence. |
| Bare final pass | KB disposition was unknown before the gate | Bare final action returns the one recovery action; knowledge-base decides capture/no-capture. | Automatic retirement without explicit KB disposition. |
| Final failure | Configured gate exits non-zero | Intent remains active and returns repair-and-rerun-final-gate. | Waiving cosmetic failure, substituting a narrow check, or retirement. |
| Runtime protection | An intent-like path points outside `<agents-root>/aidlc/<cbm-index>/intents/` | Lifecycle rejects it before I/O. | Editing or deleting conductor, knowledge, prompts, protocols, roles, scripts, utils, or skills. |

Use only `<agents-root>`, `<project-root>`, `<cbm-index>`, `<intent-path>`, and
other angle-bracket placeholders in fixtures. Never copy a real home path,
intent slug, private-KB path, or JSON ellipsis into an evaluation prompt.
