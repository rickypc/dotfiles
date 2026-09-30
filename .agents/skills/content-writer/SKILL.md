---
name: content-writer
description: Research, draft, refresh, and validate credible content with preserved quotations.
argument-hint: "<objective> <audience> <format> <constraints> <citation-style>"
---

# Content Writer

## 1. Role & Scope

This skill owns research-backed drafting, refresh, and validation of audience-
fit content. Use it when material claims need research, citations, quotations,
refresh verification, or paired SEO/GEO work. It produces a credible draft and
evidence record; it does not invent facts, silently translate quotations, or
replace domain approval and publication ownership.

## 2. Usage

```text
/content-writer <objective> <audience> <format> <constraints> <citation-style> # research and draft evidence-backed content
```

The unannotated grammar is:

```text
/content-writer <objective> <audience> <format> <constraints> <citation-style>
```

Required: objective, audience, format, constraints, and citation style. Use
this skill when claims need research, citations, quotation preservation, or
refresh verification.

## 3. Immutable Operational Rules

- Research material claims first and retain a source-to-claim record. Primary
  or authoritative sources are the evidence standard; weak sources are
  discovery leads only.
- Record publisher, date, URL, publisher/author, publication or update date,
  source class,
  supporting evidence, uncertainty, and the claim supported. Discovery-only
  material cannot close a material claim.
- **Preserve all quotations exactly**. Keep the original non-English quotation
  and ask before adding translation or transliteration when audience needs it.
- Keep the research ledger separate from reader-facing prose. Surface
  uncertainty, do not fill gaps from memory, and ask one focused question when
  audience, language, refresh state, or evidence standard changes the result.
- SEO and GEO are one paired mode: enable both or neither. Do not lower the
  evidence standard to satisfy a format, SEO, or deadline request.

## 4. Input & Context Schema

- **Required:** Objective, audience, format, constraints, and citation style.
- **Optional:** New versus refresh mode, existing-content inventory, paired
  SEO/GEO mode, supplied references, freshness requirement, and quotation or
  translation requirements.
- **Context:** Research question, non-goals, document contract, source class,
  publisher/author, date, URL, supported claim, existing content, uncertainty,
  outline, and final citation mapping.
- **Unknowns:** Unsupported claims, missing refresh facts, unresolved language
  handling, inadequate source quality, or missing approval is `needs-input` or
  `blocked`, not an invitation to write plausible prose.

## 5. Ordered Execution Chain

```text
brief -> source research -> evidence ledger -> draft -> claim verification
      -> approval or needs-input/blocked handoff
```

1. **Intake:** Parse the brief, reader job, format, constraints, citation style,
   freshness, non-goals, and whether this is new or refresh work. In refresh
   mode, inventory the existing source before drafting.
2. **Research:** Define the research question and evidence standard. Search
   primary or authoritative sources first, open and verify each material
   source, and record the research ledger.
3. **Plan and draft:** Write the compact document contract-reader, job, format,
   defining takeaway, required sections, evidence standard, and non-goals-then
   build an earned outline and draft. Keep citations and uncertainty traceable.
4. **Branch:** For documentation, orient the reader with job, constraint,
   trigger, and place among nearby documents. For SEO/GEO, enable both modes.
   For quotation handling, preserve the original and ask the focused language
   question before translating/transliterating. For refresh, record every
   changed, confirmed, rejected, and unresolved claim.
5. **Verify and hand off:** Run claim coverage, citation accuracy, quotation
   preservation, structure, audience-fit, and no-fabrication checks. Return
   exactly `ready`, `needs-input`, or `blocked` and wait for approval when
   publication ownership is external.

### Research ledger and claim matrix

For substantial research, keep one Markdown ledger with: question/claim,
source class, publisher/author, publication/update date, URL, supporting
evidence, uncertainty, and final citation. Map every material claim to an
admissible source before returning the draft. If a claim cannot meet the
standard, retain the gap and stop.

### Refresh and research distillation

Treat the current source as the starting authority. Fact-check draft-only
claims against live evidence and classify them as current, confirmed-and-
missing, conflicted/obsolete, or unverified. The verified current fact wins;
reject obsolete and unverified claims instead of preserving a chronological
log.

## 6. Output & Completion Contract

Success returns the draft in the requested format, research ledger, claim
matrix, citations, unchanged quotation record, and refresh change record when
applicable. Completion requires every material claim to have an admissible
source, each citation to support its claim, structure to fit the audience, and
the result to be exactly `ready`.

`needs-input` names the focused missing decision; `blocked` names the evidence,
approval, or format boundary. Fluency, citation count, or an outline is not
proof. Never conceal unsupported claims or altered quotations.

## 7. Evaluation Anchors

- **Canonical:** A brief becomes a cited audience-fit draft with a source-to-
  claim matrix and preserved quotations.
- **Boundary:** Discovery-only material, an altered quotation, a missing
  refresh inventory, or an unsupported claim cannot close the task.
- **Challenge:** A request combines refresh and SEO/GEO while leaving a
  non-English quotation unresolved; the skill preserves the source, enables
  both modes only together, and returns `needs-input`.
- **Independent verifier:** Claim coverage, citation checks, quotation-token
  comparison, and the output gate verify the result independently of prose
  fluency.
