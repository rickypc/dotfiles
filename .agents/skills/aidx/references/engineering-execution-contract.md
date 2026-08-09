# Engineering execution contract

This reference is owned by `/aidx`. It is self-contained and retains the
useful language, role, quality, security, UI, brownfield, and delivery
obligations needed to execute a plan after the retired lifecycle tree is
removed.

## Evidence ledger and work packets

Before mutation, maintain a small ledger distinguishing user facts, project
instructions, fresh repository evidence, decisions, assumptions, and unknowns.
Execute the plan's work packets in order: research, requirements, design,
units, delivery, review, and validation. Each packet must retain its source,
owner, target, expected result, dependency, acceptance mapping, proof, and
limitation. A missing required field is a stop unless the plan explicitly
defines a safe fallback.

## Language routing

Use the observed repository language/framework profile, not a guessed one, and
apply the common rules first. Preserve established seams and prove the risks
listed here only when the changed surface matches them:

| Surface | Execute with these checks |
|---|---|
| C#, Java, PHP, Python | Preserve transport/service/data seams; validate inputs; keep authorization separate; inspect serialization, transactions, errors, and persistence. |
| Go, Rust | Preserve ownership and cancellation; inspect contextual errors, resource lifetime, concurrency, races, unsafe scope, and task boundaries. |
| TypeScript | Pair compile-time types with runtime validation; preserve async, exported-type, serialization, and configuration contracts; avoid unsafe casts. |
| React/React Native | Preserve state ownership, routing, lifecycle, platform differences, and existing data/cache conventions; verify user-visible states. |
| Web/HTML/CSS | Preserve semantic structure; verify keyboard, focus, labels, contrast, responsive layout, safe sinks, reduced motion, and loading/empty/error behavior. |

## Role routing during execution

Route only to owners named by the plan. The role table is a quality lens, not
permission to expand scope:

- Product: confirm the implemented behavior still matches observable
  acceptance, exclusions, and preserved behavior.
- Architect: confirm extension points, interfaces, data ownership,
  compatibility, reversibility, migration, and rollback.
- Developer: make the smallest compatible change, reuse conventions and test
  helpers, and isolate unrelated cleanup.
- Quality: map each acceptance item to fresh test, smoke, browser, or direct
  observation; separate focused evidence from the configured final gate.
- Security: verify only evidenced trust boundaries, input validation, secrets,
  authorization, data handling, dependency, and supply-chain controls.
- Design: for UI scope, verify flow, states, semantic/accessibility behavior,
  responsive rules, and retained browser proof.
- Delivery: verify dependency order, unit completion, risks, and the recorded
  sequence rationale.

## Execution and proof rules

- Read the whole plan and validate path safety, section order, typed inputs,
  targets, fallbacks, stops, and output schema before mutation.
- Execute each workflow step sequentially and finish its named proof before
  starting the next. Use a fallback only when the plan's primary method fails.
- Preserve public signatures, data formats, authorization, persistence,
  migrations, external boundaries, and rollback behavior when affected.
- For JavaScript or TypeScript test changes, invoke `/bun-test-generator`
  before authoring, freeze boundary mocks, run boundary validation, then run
  `/biome-tsc-checker`. For accepted browser criteria, invoke
  `/playwright-test-generator` unless retained coverage already proves the
  criterion.
- Record changed targets, requirement mapping, tests and outputs, limitations,
  and every uncovered criterion. Run the configured project final gate once at
  the final boundary; it cannot prove an unmapped acceptance item.

## Re-plan and stop conditions

Stop before mutation for missing, unsafe, ambiguous, or unverifiable required
inputs. Stop and preserve unaffected work when evidence changes a requirement,
boundary, owner, dependency, risk assumption, architecture, or proof strategy.
Do not silently widen scope, rewrite the plan, invent a fallback, or claim
success from a stale receipt, partial check, coverage number, screenshot, or
green unrelated gate.

## Source migration map

This contract incorporates the reviewed language common/profile guidance,
architect/developer/product/quality/security/design/delivery role contracts,
shared evidence, brownfield, work-packet, verification, and rules-reading
guidance, plus the useful construction, requirements, UI, NFR, reverse
engineering, and recovery obligations. Runtime scripts, lifecycle state,
duplicated stage machinery, and implementation-specific examples were not
copied because execution must remain plan-directed and project-owned.
