# AIDX execution contract

AIDX consumes the approved plan as its requirement boundary. It executes steps
in order, records proof for each step, and stops when a step is vague, missing
its named target or proof, or changes scope, ownership, architecture, or
acceptance. It does not rediscover requirements or silently repair the plan.

Implementation guidance belongs here: make the smallest compatible change,
protect shared consumers, mock external boundaries in tests, run focused proof
for changed behavior, and reserve the configured final gate for the final
decision. Validation failures are repaired as one compatible batch; a material
scope change returns to `/aidp`.
