# In-session training protocol

This reference owns the training loop that `/skill-manager train` runs. The invocation grammar stays
in the parent Usage section; the scripts own every number. The only LLM boundary is the executing
agent and the fresh child agents it spawns. No provider endpoint, credential, or model identifier is
configured, read, or embedded.

## 1. What is trained and what is measured

| Track      | Edited surface              | Metric owner                 | Never-worse rule                               |
| ---------- | --------------------------- | ---------------------------- | ---------------------------------------------- |
| Activation | `description`, routing text | `evals/trigger-queries.json` | `train measure` gate returns `accepted`        |
| Contract   | `SKILL.md` body, references | `evals/cases.jsonl` matrix   | `train measure --track contract` is `accepted` |

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

1. Confirm `validate` passes and the query set has at least six queries per split with real
   near-misses (neighbor skills, same verb different owner).
2. Baseline: bundle, answer, `train measure --measure-only`.
3. Reflect on train failures. Edit the description first: state the job, the trigger contexts, and
   the neighbor boundary in general terms. Use a Markdown transaction for the edit.
4. Bundle the candidate, answer blind, `train measure --attempt <n>`.
5. `train select`. If `blocked`, copy the snapshot it names back before the next attempt. Stop after
   three attempts or when no train failure remains.
6. Apply the winner (copy its snapshot), `train measure --status applied`. With no winner, restore
   the baseline snapshot and record `--status rollback`.
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
   description from its train failure and remeasuring with `--status post-change` (the hold gate),
   or restore the neighbor edit that caused it. A skill that cannot hold is restored to its baseline
   snapshot (`rollback`).
5. After the final description edit anywhere, repeat step 3 for the suite once more.

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

Every Markdown file inside a skill package, and every `AGENTS*`, `CLAUDE*`, or `GEMINI*` file in the
agents root, has a comprehension set: `<skill>/evals/comprehension/<path-with-dashes>.json`, or
`<agents-root>/evals/<name>.json`. The set holds lettered multiple-choice probes about the rules of
one document. `train bundle <set.json>` prints the live document and the blind questions; the child
answers each question with one option letter in an `answer` field.

- Use a weak reader as the child (the smallest model available) so the result reflects a tiny model.
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
  against `evals/cases.jsonl` deterministically, so no child agent runs.
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
