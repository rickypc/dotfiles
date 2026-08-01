# Universal methodology index template

Use this template only when documenting committed, reusable methodology under
`~/.agents/aidlc/knowledge`. It is not a project memory directory and must not
contain customer data, active intent evidence, private-KB content, or secrets.

## Directory structure

| Directory | Purpose | Examples |
| --- | --- | --- |
| `shared/` | Cross-role workflow principles | evidence discipline, brownfield rules, verification |
| `roles/architect/` | Architecture and NFR methods | ADRs, DDD, architecture patterns |
| `roles/developer/` | Implementation and code-analysis methods | API design, data modelling, code generation |
| `roles/design/` | UI and accessibility methods | interaction patterns, WCAG, wireframing |
| `roles/product/` | Discovery and requirements methods | elicitation, prioritisation, requirements |
| `roles/delivery/` | Sequencing and collaboration methods | workflow planning, team topology |
| `roles/quality/` | Quality and validation methods | test strategy, reliability, testing |
| `roles/security/` | Security and NFR methods | threat modelling, security, DevSecOps |

`utils/aidlc/stages.ts` selects the small role-specific set exposed to a stage
packet. A guide is loaded only when its role is needed; adding a Markdown file
does not make it universally mandatory.

## Guide format

Keep one focused topic per file. State the decision it supports, evidence it
expects, alternatives or risks it helps evaluate, and when it does not apply.
Use pattern examples rather than a machine-specific path or assistant command.
For private or project-specific facts, invoke `knowledge-base`; never add them
to this committed methodology tree.
