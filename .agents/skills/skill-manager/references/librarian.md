# Librarian workflow

Skill Manager owns this reference for the librarian verbs `propose`, `check`, and `commit`, and it
applies whenever an instruction or skill document needs an edit, because every such document has an
atom map. The invocation grammar stays in the parent Usage section; the scripts own every number.

## 1. Edits are deltas over atoms

A delta is a list of ops over anchored rule atoms, and it never replaces the whole document. Each op
names an atom by its id and by the heading path of one placement, so a rule that appears at two
placements is edited only where the delta names it.

The op `add` inserts new text after a named atom, `modify` replaces one atom, `retire` removes one
atom, and `move` relocates one atom after another. The op `tag` changes only a helpful or harmful
counter and never touches the text.

Every `modify` and `retire` op carries a reason of at least 20 characters, and `commit` records it
as an `atom:<id>` row in the owner's `retirements.json`. A delta carries 1 to 40 ops. A drifted
anchor, two ops on one atom, or any change outside a named atom span rejects the whole delta.

## 2. propose

`propose` takes one proposal file with 1 to 3 candidate deltas for one document and writes one
snapshot per candidate to the OS-temp store. It writes no repository file. The store defaults to the
OS-temp directory of the shell, so set `INSTRUCTION_LIBRARIAN_STORE` to one absolute path when
`propose` and `check` run in different shells.

`propose` rejects a proposal that carries more than three candidates, so four candidates produce no
snapshot at all. The round budget is keyed by the exact document and comprehension-set fingerprints.
Existing attempts remain recorded, and each batch with fewer than three candidates includes the
current document as a baseline. The three-round limit is counted independently for each exact
document-text and probe-set fingerprint pair; rows for a different set hash remain recorded but do
not consume this pair budget. A new useful probe set therefore starts its own three-round budget.

Prior round rows without a set fingerprint must resolve through a matching batch manifest; if the
manifest is absent, unreadable, or mismatched, round accounting fails closed rather than guessing.

`propose` itself rejects a candidate that changes the skill description or leaves the document text
unchanged. That rejection is `propose`'s own decision and never passes to `check`. A candidate whose
delta rewrites the description line is rejected by `propose`.

## 3. check

First inspect the whole no-admissible verdict: per-atom probe vectors, all reader diagnoses, and the
measured baseline for each candidate. The pinned weak reader consistently judges comprehension on
the frozen probe set. Its score does not decide policy truth or action compliance: an independent
policy owner verifies probe labels against governing rules, and deterministic behavior seals plus
the instruction gate assess actions. Use diagnoses as hypotheses, verifying each quoted rule against
the source before editing. If the reader cannot distinguish a candidate from current text, the edit
has no reader-visible behavior change; restate it or repair the assertion, and do not rerun
unchanged text. Maintain the intent ledger through every round, verify each change against accepted
text, and never drop an intent because an earlier round rejected it. The weak reader is the judge:
when it cannot distinguish the candidate from the current text, the edit has no reader-visible
behavior change, so restate the candidate toward reader-visible behavior or repair the wrong-shaped
assertion; never rerun an unchanged measurement. Keep an intent ledger of every change the edit must
deliver, verify each intent item against the accepted text before closeout, and never drop an intent
item because an earlier round rejected it.

`check` runs the structural checks first, then one batched reader run over every candidate, and then
prints one verdict for the round. A structural failure skips the reader run and is reported with the
candidate.

A batch with fewer than three candidates also measures the current text, so a gain is counted
against a measured baseline and not the last receipt.

The verdict lists the per-atom probe vectors, the reader's diagnosis for each failed probe, and the
editor's `expectedBehavior` beside it. The raw reader rows stay in the store as `result.json`.

`check --allow-swap <reason>` admits a non-core train loss that is matched by at least as many
gains, and the later `gate record` needs the same flag.

A candidate is admissible only when it loses no core train probe, loses no held-out validation pass,
and either gains a train probe or proves its intents. A non-additive edit declares its gain
instrument in the candidate: a compression (negative token delta) carries move-type intents, one per
merged rule cluster, each an information question the weak reader answers correctly before and after
the edit, proving the rules survived the rewording; pre-verify the set with evaluate-batch before
spending a check round. An edit that loses no probe and proves all its intents is admissible even
with no new passing probe, while word-shuffling that proves no information preservation is not.
`check` selects the unique frontier winner, and equal vectors are ordered by fewest changed atoms,
then smallest token delta, then candidate id.

When the frontier holds incomparable vectors, `check` selects none and reports a trade-off. After
the third round `check` stops with the budget reason instead of asking for another round.

## 4. commit

`commit` is the only verb that writes an instruction file. It refuses a verdict that selected no
candidate, is bound to a different candidate, or is stale for the document, the atom map, or the
probe set.

`commit` refuses to touch a behavioral atom without a behavior verdict. It leaves the receipt stale,
so run `instruction-gate record` on the document afterward.

`commit` reports the probes whose evidence no longer resolves, and the editor updates those probes
in the comprehension set.

## 5. Behavior seals

A behavioral atom is one that a behavior case cites by source lines, and `atoms --write` tags it
from `evals/coverage-map.json`. A candidate that touches a behavioral atom needs a passing seal for
every behavior case that cites the atom, and without it `check` does not select the candidate and
`commit` refuses to write.

`seal` scores one fresh target run with the literal hard assertions of the case over the captured
output, trace, and diff, so no model grades it. The capture must echo the caller-generated `runId`
and carry the target session id, and the verdict line binds the sha256 of the candidate text and the
transcript hash in the owner's `behavior-seals.jsonl`.
