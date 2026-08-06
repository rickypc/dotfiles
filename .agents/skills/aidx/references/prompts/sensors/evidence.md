# Evidence check

Governing protocol: [evidence protocol](../../protocols/evidence.md).

Pass when the current state has concise factual evidence naming the work,
source, decision, result, or justified inapplicability. “Not needed” alone is
not a valid skip.

On failure, remain in the current state, obtain the missing evidence, and run
the sensor again. Never bypass a missing record with direct metadata edits.
