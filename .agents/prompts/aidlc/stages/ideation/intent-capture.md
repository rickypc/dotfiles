---
stage: intent-capture
number: "1.1"
phase: ideation
condition: "always"
route_authority: "~/.agents/utils/aidlc/stages.ts"
---

# 1.1 Intent Capture

Establish a precise problem statement before feasibility, scope, or design.
Read the user request, project instructions, relevant role knowledge, and only
the validated knowledge-base context returned for this intent. Do not make a
private KB path, an old intent, or an upstream memory tree a source of truth.

## Capture method

Record in the central intent's **Research** and **Decisions** sections:

- desired outcome and the problem it solves;
- affected users, systems, and observable success criteria;
- known constraints, exclusions, deadlines, compatibility obligations, and
  user-provided references;
- evidence source for each material claim: user-provided, project instruction,
  codebase-memory observation, knowledge-base concept, or explicit assumption;
- unanswered questions that materially alter scope, behavior, safety, or
  architecture.

Ask only the smallest set of material questions. Explain what each answer
unlocks. Do not require market analysis, staffing, visual design, or a user
story format when the request does not need it. Keep assumptions visible rather
than converting them into facts.

## Exit

Summarize a single intent statement with measurable or observable success,
constraints, and open risks. Run the intent-evidence sensor and record
completion. There is no approval here: Feasibility and Scope Definition refine
the intent before the single 1.7 approval gate.
