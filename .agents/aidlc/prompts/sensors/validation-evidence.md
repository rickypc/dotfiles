# Validation-evidence sensor contract

## Applies to

Build and Test (3.6) only. The executable check is `utils/aidlc/sensors.ts`.
It requires the exact successful receipt emitted automatically by
`aidlc.ts complete <intent-path>` at 3.6.

## Pass condition

The current stage evidence includes:

```text
final gate: <command> passed (exit 0)
```

`<command>` is the one project-owned `finalGate` declared in
`<project-root>/aidlc.config.json`, or `bun run test` when the configuration is
absent. The receipt must come from `bun ~/.agents/scripts/aidlc.ts complete
<intent-path>` with no evidence argument.

## Required behavior

Run no substitute final command. Focused tests, lint, type checks, coverage,
visual checks, and earlier green results can guide development but cannot close
the route. A non-zero receipt—including a cosmetic failure—is failure: repair
the approved scope and rerun the same configured command.

## On failure

Keep the intent active at 3.6 with the failing output as evidence. Do not
record completion, retire the intent, or capture reusable knowledge until the
same single gate passes.
