---
title: "Brief Title of the Feature/Fix"
cbm_index: "slugified-project-path-index"
created_at: "YYYY-MM-DD"
updated_at: "YYYY-MM-DD"
status: "pending"
---

# ROLE
[The specific role the AI must assume, e.g., Expert Backend Engineer, DevOps Specialist]

# OBJECTIVE
[A high-level executive summary of what this plan aims to accomplish]

# CORE DIRECTIVES
- [High-level goals and what we are trying to achieve]
- [Core rule or theme for this run]
- [If any target modifies a skill package, the first applicable ordered item must invoke /skill-manager for that skill package before any skill change and record its validation/review proof]
- [Research artifacts are evidence, not templates: retain generalized patterns and explicitly discard project-specific domain content]
- [Begin with README-first repository intake: inspect present primary files and high-signal directories, inventory documented commands and entrypoints, separate explicit evidence from inferred findings, and record ambiguity]
- [When a language/framework is observed, read `<agents-root>/aidlc/knowledge/languages/common.md` first and select only applicable sections from `profiles.md`; map the relevant obligation and project-owned final gate without copying unrelated profiles or inventing commands]
- [For a refactor request, establish baseline behavior and preservation invariants, inspect test coverage and gaps, define scope and exclusions, record rejected alternatives, and order the smallest safe increments with independent proof]
- [Before ordering work, map each target file or artifact to its responsibility, verified symbol or section, owner, dependency, and test boundary; every item must be independently testable with an exact proof command or deterministic check and expected outcome]
- [Before materialization, self-review objective/constraint/exclusion coverage, placeholder absence, and name/interface/dependency consistency; keep unresolved gates visibly pending or blocked]

# ORDERED EXECUTION STEPS
Status legend: `[ ]` pending; `[~]` in-progress; `[!]` blocked; `[x]` complete; `[-]` skipped with a reason. Each ordered step must carry its own checkbox on its numbered line; the legend and any aggregate status receipt never replace the per-item checkbox.
Refactor branch when applicable: begin with baseline behavior, preservation invariants, coverage gaps, scope/exclusions, rejected alternatives, and the smallest safe increment. Language-aware branch when applicable: name the observed language/framework, selected shared guidance, target obligation, and project-owned proof.
1. [ ] Action: [one concrete operation for an independently testable deliverable]; Target or Boundary: [exact file, symbol, artifact, or scope plus responsibility and test boundary]; Source -> Target: [researched source and exact destination, or `none` with reason]; Disposition: [retain generalized pattern or discard project-specific detail]; Change or Decision: [observable result, selected approach, and rejected alternative when material]; Dependency or Ordering: [preceding/following step and interface dependency]; Reason: [evidence-backed purpose]; Acceptance or Proof: [exact command or deterministic check and expected outcome]; Failure or Stop: [condition that returns to planning]
2. [ ] Action: [one concrete operation for independently testable deliverable 2 with the same fields]; Target or Boundary: [exact scope, responsibility, verified symbol or section, and test boundary]; Source -> Target: [source to destination or justified none]; Disposition: [retain generalized pattern or discard project-specific detail]; Change or Decision: [result and approach decision]; Dependency or Ordering: [ordering and interface dependency]; Reason: [purpose]; Acceptance or Proof: [exact command or deterministic check and expected outcome]; Failure or Stop: [stop condition]

# CONSTRAINTS
- [Guardrails, file blocks, or structural limitations]

# INPUTS TO PROCESS
- [Specific source paths used as evidence, summarized by reusable pattern; project-specific payload is discarded unless implementation is explicitly requested]
