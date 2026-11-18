# In-session training protocol

Skill Manager owns this protocol for evaluation training and weak-reader execution across the global
and supported project-local `.agents` scopes. This reference owns the training loop that
`/skill-manager train` runs. The invocation grammar stays in the parent Usage section; the scripts
own every number. The only LLM boundary is the executing agent and the fresh child agents it spawns.
No provider endpoint, credential, or model identifier is configured, read, or embedded.

## 1. What is trained and what is measured

| Track      | Edited surface              | Metric owner                                      | Never-worse rule                               |
| ---------- | --------------------------- | ------------------------------------------------- | ---------------------------------------------- |
| Activation | `description`, routing text | `evals/skills/<skill>/trigger-queries.json`       | `train measure` gate returns `accepted`        |
| Contract   | `SKILL.md` body, references | `evals/skills/<skill>/cases.jsonl` matrix         | `train measure --track contract` is `accepted` |

Both tracks share the hard checks, which block any candidate: `validate` frontmatter, candidate and
challenge matrix receipts, a balanced query set named for the skill, at most 500 lines in
`SKILL.md`, and a description of at most 1,024 characters.

Activation is the only metric an LLM must produce, so it is the only one trained by sampling. The
contract track stays deterministic: add a failing case first, then repair, and keep every earlier
case.

## 2. Metric definitions

- **Query pass:** a query passes only when every run agrees with its label. A should-trigger query
  needs all runs to name the skill under test; a near-miss query needs no run to name it. A mixed
  result is `unstable`: it is never a pass, and the reply lists it so the author can fix the
  description, the document, or the query.
- **Gain:** a query that failed at baseline and now passes with unanimous runs (all hits, or no hits
  for a near-miss).
- **Regression:** any query that passed at baseline and does not pass now, in either split.
- **Accept (`attempt`):** no hard failure, same query-set fingerprint, changed source, zero
  regressions, at least one gain. Everything else is `blocked` with the reason.
- **Hold (`applied`, `post-change`):** no hard failure and zero regressions against the baseline;
  `applied` must also equal an accepted attempt's snapshot.
- **Winner:** among accepted attempts, highest validation score, then train score, then the earliest
  attempt.
- **Saturation:** the baseline passes every query. Gains are impossible, so append harder near-miss
  queries (neighbor skills' scopes, shared verbs, ambiguous phrasing), `ratchet` them, and record a
  new baseline. Do not report a saturated skill as optimal.

The query set is frozen by fingerprint (queries, split, polarity, expected answers, retirements,
runs). A changed set blocks every attempt until it is extended and re-baselined, so a metric cannot
be weakened to pass.

## 3. Why this design

The loop adapts the shared core of open-source prompt optimizers, minus provider calls:

- Held-out selection (DSPy MIPROv2 and GEPA, the skill-creator description loop): edits are guided
  by the train split; the keep decision never uses train alone.
- Reflection on failing traces (GEPA, TextGrad, OPRO): the agent reads train failures, names the
  generalizable cause, and proposes one edit. One edit per attempt keeps attribution clear.
- Unanimity over repeated runs (five per routing query, three per probe): answers are noisy, so a
  query counts as passed only when every run agrees. A noisy query is flagged `unstable` and fixed
  rather than averaged away, so the never-worse guard rests on stable queries only.
- Assertion-graded evals (promptfoo, Inspect): the contract track uses typed deterministic
  assertions rather than a model judge.
- A ledger with snapshots replaces trust: every attempt's source is stored, so rollback is a copy.

Microsoft SkillOpt was rejected because it depends on a provider boundary this runtime does not
have.

## 4. Blind measurement

The editing agent knows the labels and the intended answer, so it must not answer router prompts.
`train bundle` removes labels, splits, and the skill name. For each run index `k`
(`1..runs_per_query`) spawn one fresh child agent with this prompt and nothing else:

```text
Read <bundle-path> only. You are the skill router described by its `instructions`. For every prompt
whose `run` is <k>, answer with exactly one catalog skill name or NO_SKILL for the prompt's `query`.
Read no other file and run no command. Write one JSON object per line to <answers-path>, with
`query_id`, `run`, and `skill_name`. Reply `done`.
```

Concatenate the answer files into one `.jsonl` and pass it to `train measure`. The measurement
rejects unknown skill names, duplicates, and missing runs, so a fabricated or partial answer set
cannot be scored. When one catalog serves several skills, merge their bundles: give every prompt an
opaque id (`q0001`), keep the id map where children cannot read it, shuffle prompts within a run so
skill grouping is hidden, chunk to about ninety prompts per child, and split the answers back per
skill before measuring. Answers for unchanged queries under an unchanged catalog may be reused when
a query set is extended; any description change invalidates them.

The edit loop sees `trainQueries` detail and only the validation counts. Do not look up validation
query text; it exists to catch overfitting, not to guide edits.

## 5. Loop for one skill

1. Confirm `validate` passes and the frozen query set has at least six queries per split with real
   near-misses (neighbor skills, same verb different owner).
2. Record one baseline with `train bundle`, blind answers, and `train measure --measure-only`. Keep
   its source snapshot and matrix fingerprint fixed throughout this candidate search.
3. Make at most three candidate attempts total, numbered 1 through 3. A blocked measurement counts
   as an attempt. Before each edit, restore the snapshot named by the latest `train select` winner;
   when there is no winner, restore the baseline. Make one bounded edit and use train failures only
   to diagnose it. Never inspect validation query text.
4. Bundle each candidate, collect blind answers, then run `train measure --attempt <n>`. A candidate
   is accepted only when the gate says `accepted`. Any failed hard check or hard assertion rejects
   the candidate even when other scores or axes pass. Keep the assertion and frozen matrix intact;
   repair the source under those constraints or reject the candidate. Never waive, reinterpret,
   remove, or bypass a failing assertion or guardrail.
5. Run `train select` after each measurement. It chooses among accepted snapshots by validation
   score, then train score, then earliest attempt. An accepted attempt is eligible for selection,
   not automatically the winner. If train failures remain and fewer than three attempts were
   measured, revise from train failures and try again. Do not repeat a change listed in
   `doNotRetry`.
6. When no train failures remain or the three-attempt limit is reached, select once more. If there
   is a winner, copy that exact snapshot and record `train measure --status applied`, then record
   the suite's `--status post-change`. If there is no winner, restore the baseline snapshot and
   record `--status rollback`. Report remaining failures; a rollback or a rejected candidate is not
   a pass.
7. `ratchet` any changed matrix or query set against `git show HEAD:<path>` written to the OS temp
   directory, then run the project gate.

## 6. Suite runs and noise

A description change can steal triggers from neighbors, so a single-skill pass is not enough:

1. Baseline every skill against the unchanged catalog before editing any description.
2. Train skills one at a time; the bundle substitutes the on-disk candidate description into the
   catalog, so neighbors are measured against current text.
3. After the last edit, remeasure every skill with `--status post-change` against the final catalog.
4. A `blocked` post-change skill lost a query that every run used to pass, so treat it as a real
   regression; never remeasure just to get a pass. Repair it by editing the blocked skill's
   description from its train failure and remeasuring with `--status post-change` (the hold gate).
   Keep the rejected candidate as the working source and make a diagnosis-based next edit; a
   rejected measurement alone is not a reason to restore the baseline. Never inspect held-out query
   text or tune an edit to a hidden probe. Do not record `rollback` solely because a run rejected.
5. After the final description edit anywhere, including a repair, repeat step 3 for every skill in
   the suite against the final catalog. A suite run performed before the latest repair is not final.
   If that suite run leads to another repair, repeat the suite after that edit as well.

Expect saturation. With a small, well-separated catalog most skills pass every query at baseline;
write near-miss queries from the neighbor pairs that actually collide (instruction files versus
Markdown compression, test repair versus browser tests, planning versus execution) and keep the
labels unambiguous under the ownership rules in the runtime policy. A mislabeled query trains the
wrong boundary; if the label is wrong, extend the set rather than editing the query.

## 7. Resuming

`train select` is the status command. It reports the ledger generation, every attempt's decision,
`liveState`, and `nextAction`. `measured` means the live file equals a recorded non-baseline entry
(`liveEntry` names it), such as a repaired description held by `post-change`. `unrecorded` means the
live file matches no ledger entry: measure it as an attempt or restore the baseline snapshot. Do not
re-baseline to hide a loss.

## 8. Documents and the weak reader

Each document has a comprehension set. Where the set lives depends on the document:

- A Markdown file in a global skill package:
  `<agents-root>/evals/skills/<skill>/comprehension/<source-key>.json`.
- A Markdown file in a supported project-local skill package:
  `<project-agents-root>/skills/<skill>/evals/comprehension/<source-key>.json`.
- An `AGENTS*`, `CLAUDE*`, or `GEMINI*` root instruction file in the global agents scope:
  `<agents-root>/evals/comprehension/<name>.json`, where `<name>` is the file name without `.md`.
  For example, `CLAUDE.md` uses `CLAUDE.json` in the `comprehension` directory.
- A project-root instruction file, including `AGENTS.override.md`:
  `<project-agents-root>/evals/comprehension/<name>.json`, where `<name>` is the file name without
  `.md`. Its `target` is relative to the set file; for example, use `../../../AGENTS.override.md`.
  Its `skill_name` is `instructions--<name lowercased>`.

The set holds lettered multiple-choice probes about the rules of one document.
`train bundle <set.json>` prints the live document and the blind questions; the child answers each
question with one option letter in an `answer` field.

- Run the built-in local reader to answer a document bundle with no human step:
  `bun <agents-root>/scripts/weak-reader.ts <bundle> <answers>`. Both arguments are absolute paths:
  the bundle is the saved output of `train bundle`, the answers file feeds `train measure`.
- The reader needs the `webgpu` package (`bun add webgpu` in the agents root) and a GPU adapter. Its
  first run downloads only Google's Gemma 4 E2B weights, once, into the standard Hugging Face cache
  (`HF_HOME`, else `~/.cache/huggingface`), verifies every file, and records the revision so later
  runs need no network; nothing is stored in the agents root. When the network re-signs connections
  the reader retries with the system trust store; set `NODE_EXTRA_CA_CERTS` only if that retry also
  fails.
- The built-in reader is the pinned local Gemma reader. Child-agent answers do not replace it.
- Exit codes: 0 answered, 1 other failure, 2 no GPU adapter, 3 integrity failure, 4 missing package,
  5 document too long.
- When the process is sandboxed it finds no adapter and exits 2. This does not cancel authorized
  work. Finish the edit and available checks, then give the user the exact blocked GPU command in a
  fenced block with its working directory and ask them to run it. Wait for them to paste the output
  before closeout. The sandbox attempt writes no receipt and cannot pass the gate. Do not substitute
  child-agent answers for the pinned reader.
- An unparseable reply is written as `NONE` (a document) or `UNPARSEABLE` (a router) and scores as a
  miss.
- The reader runs on macOS (Metal through Dawn); it is not meant for any other platform.
- To learn what the weak reader finds hard, run
  `bun <agents-root>/scripts/weak-reader.ts suggest <bundle> <failures> <suggestions>`. `<failures>`
  is a JSON array of train misses, each with `id`, `query`, `expected`, and `given`. For every miss
  the reader quotes the sentence it relied on, says what was hard to read, and proposes a clearer
  replacement. Treat the output as a lead: check each proposal against the document before editing.
- `bun <agents-root>/scripts/weak-reader.ts batch <batch-json>` answers many bundles in one process,
  loading a fresh model for each document, so every answer matches the single-document run. A shared
  session kept the previous document's cached prefix and flipped one probe in a parity check. Do not
  call it by hand: `instruction-gate evaluate-batch` builds the batch file and scores the answers
  (§12).
- The runtime bundle is vendored in `vendor/gemma-4-e2b/` with its origin, license status, and two
  edits recorded there. The edits let the reader keep the cached document prefix between questions
  and size the context from the document (up to the model limit of 131072 tokens). The document is
  read once, then each question takes under a second. The reader logs load, warmup, first-token,
  per-query, and total times.
- The gate makes this deterministic. `bun <agents-root>/scripts/instruction-gate.ts record` measures
  each changed instruction document and writes receipts only for a never-worse result. Root
  instruction receipts stay at `evals/receipts/<document>.json`; global skill-document receipts are
  at `evals/skills/<skill>/receipts/<source-key>.json`; and aggregate description routing is at
  `evals/skills/_catalog/receipts/activation.json`. `... instruction-gate.ts verify` runs in the
  final gate with no GPU: it fails when a document or its comprehension set changed after its
  receipt, when a receipt was edited, or when a recorded result is worse than its baseline.
- A receipt records the document hash, the set hash, and the reader (model revision, runtime hash,
  prompt version). Greedy decoding makes the same inputs give the same answers, so a receipt is
  reproducible. When the reader changes, every receipt needs `record --rebaseline <reason>`.
- A project-local skill is gated with `--agents-root <project>/.agents`, as in
  `instruction-gate.ts record --agents-root <project>/.agents skills/<name>/SKILL.md`. Its sets and
  receipts live under that root. The global scripts still run from the package. Use the same flag
  with `verify`. Skill descriptions are not gated for a project root.
- Skill descriptions are gated as one unit, because the router reads every description.
  `record descriptions` has the reader route every query from each
  `evals/skills/<skill>/trigger-queries.json` through the full catalog and stores one receipt at
  `evals/skills/_catalog/receipts/activation.json`. One edit moves other skills' probes, so routing
  compares score totals instead of single probes: the train total and the held-out validation total
  must not fall, and a catalog that still has failing queries must gain. The reader accepts a skill
  name in any case and with `-`, `_`, or a space between words, so `review_changes` counts as
  review-changes. The retry loop below applies: read the DIAGNOSIS, rewrite the descriptions it
  names, record again.
- Run `record` where a GPU adapter exists. When the executing agent has an approved host command
  route, use it and continue the retry loop without a user handoff. When the sandbox has no adapter
  and no approved host route is available, finish the edit and local checks, then give the user the
  exact command and working directory and wait for its output. After a rejection, use the permitted
  diagnosis and train evidence to make the next source edit, then give the exact command for the
  next run. Do not ask whether to continue, and do not restore the baseline solely because a run
  rejected.
- Separate retry loop for an `instruction-gate.ts record` rejection or a document that still has
  failing weak-reader probes. This is not the three-attempt `train measure` candidate loop in §5.
  The agent owns each diagnosis, edit, and retry; whether it runs the gate itself or hands the exact
  gate command to the user depends on GPU access:
  1. Read the DIAGNOSIS block: each failing probe, its source rule, and the weak reader's own view.
  2. Treat the reader's suggested wording as the first candidate. A small model is the audience, so
     what confuses it is the signal; but it can misquote the source or invent text, so check each
     suggestion against the source rule and keep only what is faithful. Then infer the cause. Common
     causes: the rule sits in a long paragraph; a nearby sentence copies the wording of a wrong
     option; an unrelated edit moved a probe that passed, so restore the nearby text; the reader
     finds the rule but picks the wrong letter, so restate the rule in the shape of the question
     near the end of the document.
  3. Rewrite the source passage as short, direct sentences and run `record` again. Record every
     changed document in one batch.
  4. After 5 rewrites without a new pass, run
     `record --allow-equal "<reason naming the remaining probes>"`. The never-worse rule still
     holds. Report the remaining probes in the closeout.
- `--allow-equal <reason>` belongs only to the instruction-gate receipt loop. It can record a
  never-worse equal result while probes remain failing, but it does not make those probes pass. It
  never turns a blocked `train measure` candidate into an accepted candidate or overrides a failed
  hard assertion.
- Audit every probe label first with a strong reader. A probe the strong reader answers differently
  is wrong or ambiguous: fix it before the first baseline, or retire it afterwards.
- Write fixes for failing probes as short sentences, one rule per sentence, with numbered lists for
  order and an example for any rule that mixes two conditions.
- A document is clear when the weak reader answers every probe correctly on every run.

## 9. Edit cap and rejected-edit buffer

Each attempt is one bounded edit. The script measures it against the baseline snapshot, not git.

- An attempt changes the description or the body, never both.
- The description edit changes at most 25 percent of the baseline description characters. Override
  it with `--max-description-change <percent>`.
- The body edit changes at most 40 lines. Override it with `--max-body-lines <n>`.
- An attempt over a cap fails before any ledger or snapshot write. Shrink the edit and measure
  again.
- A `blocked` attempt stores a `rejected` record on its ledger entry: the reason, the regressed ids,
  the gained ids, and a change summary.
- `train select` lists those records as `doNotRetry` for the current generation. Read it before the
  next edit and do not repeat a listed change.
- A ledger entry without a `rejected` field still loads.

## 10. Contract track

- `train measure <skill-path> --track contract` takes no responses file. It checks `SKILL.md`
  against `<agents-root>/evals/skills/<skill>/cases.jsonl` deterministically, so no child agent
  runs.
- Each assertion is one record with the id `<case-id>:<kind>:<index>`. Candidate cases score the
  train split. Challenge cases score the validation split. One run is one pass or one failure.
- The ledger is `<skill>-contract.json` under the ledger root, separate from the activation ledger.
- The gate, snapshot, edit cap, and rejected-edit buffer are those of the activation track.
- The only hard check is the structural `validate` check, so a failing assertion is a measured
  failure and not a hard failure.
- The report lists candidate failures in detail and challenge results as counts only. Do not look up
  challenge assertion text.
- `train select <skill-path> --track contract` reports the winner, the live state, and `doNotRetry`.
- Record one baseline per frozen matrix with `--measure-only`. Append cases only, then run
  `ratchet`.

## 11. Retiring queries

Before the first baseline a wrong label may be corrected in place. After a baseline, never edit or
delete a query: add `"retired": "<reason>"` to it. A retired query stays in the file for audit, is
skipped by bundles, scoring, and balance checks, and changes the fingerprint, so record a new
baseline afterwards. Retire a query when its label is wrong, when two skills could both own it, or
when the document rule it tested was deliberately replaced.

## 12. Atom maps, audit, and batch scoring

An atom is one rule sentence of an instruction document. Its id is a hash of its text, so it does
not depend on where the sentence sits. `placements` lists every heading path where that text
appears: a rule written twice is one atom with two placements.

- Each document has one map, `evals/atoms/<key>.md` for the root document and
  `evals/skills/<skill>/atoms/<key>.md` for a skill document. `<key>` is the file name of the
  document's comprehension set. Both manifests list every map in `artifacts.atoms`, and the `atoms`
  lane in `requiredLanes` makes that list required. The three frozen skills have no maps.
- A map is derived from probe evidence. The `evidence` text of every active probe must appear in the
  document; the sentences it covers become atoms linked to that probe. A retired probe is skipped.
  Never edit a map by hand.
- After you edit a document or a probe's `evidence`, run
  `/skill-manager atoms <agents-root> <owner-id>` to preview, then run it again with `--write`. It
  keeps each atom's recorded state by atom id: `tags`, `precedence`, `behavioral`, `helpful`,
  `harmful`, and sensitivity. It also rewrites the manifest lists. For a skill it refreshes the
  `sources` hashes and the rubric fingerprint in the skill manifest, which `validate-skills` rejects
  when stale. An atom whose text left the document becomes `retired`. Record that in the owner's
  `retirements.json` as a row whose `caseId` is `atom:<id>`. A probe whose evidence no longer
  matches appears under `unresolvedProbes`: correct its `evidence`, or retire the probe (§11).
- `/skill-manager audit <agents-root> [owner-id]` never writes. For each owner it lists map errors,
  including a comprehension set with no map, and these findings:

  | Finding                 | Meaning                                                               |
  | ----------------------- | --------------------------------------------------------------------- |
  | `orphan-atom`           | No active probe covers the atom.                                      |
  | `orphan-probe`          | No active atom links the probe.                                       |
  | `anchor-drift`          | The recorded placements differ from the document.                     |
  | `unrecorded-retirement` | A retired atom has no `atom:<id>` row.                                |
  | `size-budget`           | The document is over `maxDocumentChars`.                              |
  | `near-duplicate`        | Two atoms share most 3-word shingles (`duplicateSimilarity`).         |
  | `duplicate-text`        | Identical text of 30 or more characters sits in several placements.   |

  `near-duplicate` and `duplicate-text` are reports for the owner to review, not failures. The
  limits are in the root manifest `policy.atomChecks`. The audit also counts each active probe as
  `calibrated`, `uncalibrated`, or `unmeasured`; a probe is `unmeasured` until a calibration run
  records mutant results for it in the map's `sensitivity` list.
- `instruction-gate evaluate-batch <request> [<output>]` scores candidate document texts against a
  document's comprehension set without recording anything. The request holds 1 to 3 candidates per
  document; the result gives each candidate's measurement, per-probe pass vector, and failure
  diagnoses. It uses the reader and the scoring code of `record`, so a candidate equal to the
  current file scores like its receipt. It writes no receipt, ledger, or snapshot.
- A candidate may carry `intents`: one question per delta that the edit must change, each with `id`,
  `op`, `prompt`, `options` (2 to 6), and `expected` (the option letter). The result reports each as
  `before`, `after`, and `proven`. An `add` or `modify` is proven when the reader misses it on the
  current text and gets it on the candidate; a `retire` is the reverse; a `move` must be answered
  correctly on both. An unproven intent means the reader cannot see the edit. Intent probes are
  scored in the same run and are never added to the document's held-out set.
- `instruction-gate calibrate <owner-id>... [--write]` measures how sensitive each probe is to the
  rule it tests. For each document of the owner it takes up to 8 atoms in hash order of their id and
  builds mutants of the document: the atom's sentence deleted, negated (`must`, `should`, `never`,
  `always`, `do not` swapped for their opposites), or, for a numbered step, swapped with the next
  step. It asks only the mutated atom's probes on each mutant, and a probe is flipped when its
  answer differs from its answer on the unmutated text. A fresh model answers each mutant, as in
  `evaluate-batch`. With `--write` the counts go into the map's `sensitivity` list, replacing the
  entry of every probe it measured. A probe that never flipped is `uncalibrated`: no rule change
  reaches it, so its pass or fail carries no signal. The report lists those probes for the owner.
  Never weaken or remove a probe because of this; retire it by §11 only after the owner agrees.
- `audit` also lists each probe that never flipped under `uncalibrated`, with the document and the
  number of mutants tried. Review that list with the owner before relying on the core.
- `instruction-gate record` applies an acceptance policy to a global document that has an atom map.
  The core is the set of probes whose `sensitivity` shows at least one flip. Losing a core train
  probe always rejects. Losing any other train probe is a swap: it needs `--allow-swap <reason>`,
  the reason is stored in the receipt as decision `swap`, and the edit must gain at least as many
  probes as it loses, counting a held-out gain. Held-out validation may never lose a pass, because
  the per-probe held-out results stay hidden from the editor. A document without an atom map keeps
  the plain per-probe rule, and so does the routing record.
- Every distinct text of a document scored against its held-out probes is a look, whether the record
  is accepted or rejected. `evals/held-out-looks.jsonl` (`evals/skills/<skill>/held-out-looks.jsonl`
  for a skill) holds one line per look or rotation, and `policy.heldOutLooksPerEpoch` in the root
  manifest sets the limit (2). Recording the same text again is not a new look. The next distinct
  text after the limit is refused before any reader run. A fresh session that sees the atoms but no
  candidate diff authors a new held-out pool, then `record --rotate-pool <pool-file>` hashes it,
  starts a new epoch, and the record proceeds. Add the pool's probes to the set by §11 and
  `ratchet`.
