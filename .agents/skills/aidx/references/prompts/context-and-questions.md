# Context-and-questions prompt

Inspect only the context needed to make the goal implementable. Read the
applicable project instructions, discover the relevant code paths, identify
existing patterns, locate tests and final validation, and consult durable
knowledge only when it can change the plan.

Separate observed facts, inferences, unknowns, ownership, dependencies, and
likely proof surfaces. Then ask the smallest concise set of questions whose
answers can change scope, behavior, safety, architecture, ownership, or
validation. Ask all currently known material questions together. If no such
question remains, record that fact and continue without manufacturing a user
turn.

Questions may be answered directly in the goal record’s `Questions and
Answers` section or in a sibling answers file. Merge the answer source before
planning and retain the path as evidence.
