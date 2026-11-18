---
atoms:
  - behavioral: false
    harmful: 0
    helpful: 0
    id: r-9e49b18f40
    placements:
      - headingPath: &ref_0
          - AIDX execution contract
    precedence: 0
    probeIds:
      - train-01
    status: active
    tags:
      - boundary
      - rule_meaning
    textSha256: 9e49b18f40b8ec98fd4f950ad67bd1b390ce4c9029f58c99bb6201b559318ad1
  - behavioral: false
    harmful: 0
    helpful: 0
    id: r-f256abdb3b
    placements:
      - headingPath: *ref_0
    precedence: 0
    probeIds:
      - train-02
      - train-06
    status: active
    tags:
      - precedence_order
      - rule_meaning
    textSha256: f256abdb3b981dc0e0d7e0bc7b843459c2d19ced769962d53e61a931d8543de5
  - behavioral: false
    harmful: 0
    helpful: 0
    id: r-921533a949
    placements:
      - headingPath: &ref_1
          - AIDX execution contract
    precedence: 0
    probeIds:
      - train-03
    status: active
    tags:
      - combined_pressure
      - precedence_order
      - rule_meaning
    textSha256: 921533a949fffdcf56727b33a20956295b6ab5a7399bc71c6a147f9e159500c6
  - behavioral: false
    harmful: 0
    helpful: 0
    id: r-fa2022d6d8
    placements:
      - headingPath: *ref_1
    precedence: 0
    probeIds:
      - train-04
    status: active
    tags:
      - rule_meaning
    textSha256: fa2022d6d8fbaae66d2164cfe354a2fd514227b54db39132ead249433b6fba85
  - behavioral: false
    harmful: 0
    helpful: 0
    id: r-6672a0a86a
    placements:
      - headingPath: *ref_1
    precedence: 0
    probeIds:
      - train-05
      - train-09
    status: active
    tags:
      - boundary
      - rule_meaning
    textSha256: 6672a0a86a8f7889dfec5a975f46988791f32a4e559074c217c4682bad2fee7b
  - behavioral: false
    harmful: 0
    helpful: 0
    id: r-899db8b544
    placements:
      - headingPath: &ref_2
          - AIDX execution contract
    precedence: 0
    probeIds:
      - train-07
    status: active
    tags:
      - precedence_order
      - rule_meaning
    textSha256: 899db8b5445b4b2fbd318d5d6b7df072ed19c715f310c477a06c8265f0252f1c
  - behavioral: false
    harmful: 0
    helpful: 0
    id: r-fec902be12
    placements:
      - headingPath: *ref_2
    precedence: 0
    probeIds:
      - validation-03
    status: active
    tags:
      - precedence_order
      - rule_meaning
    textSha256: fec902be12cc6ca293de6447779d5a69a46930c53bf9085cc16bd4336db1c34a
  - behavioral: false
    harmful: 0
    helpful: 0
    id: r-d8ac8f0f3c
    placements:
      - headingPath: *ref_2
    precedence: 0
    probeIds:
      - validation-05
    status: active
    tags:
      - boundary
      - exception_failure
      - rule_meaning
    textSha256: d8ac8f0f3c4552f03d96dc1d26154fe03c02e9d89bf1a39d5fd06e25b23868f2
  - behavioral: false
    harmful: 0
    helpful: 0
    id: r-1e95410ac2
    placements:
      - headingPath:
          - AIDX execution contract
    precedence: 0
    probeIds:
      - train-08
      - validation-01
    status: active
    tags:
      - combined_pressure
      - rule_meaning
    textSha256: 1e95410ac2157f2c8741b23f25e97f74d07db0407fbb0ed6f1475faa385175ff
  - behavioral: false
    harmful: 0
    helpful: 0
    id: r-b90b7a2c17
    placements:
      - headingPath: &ref_3
          - AIDX execution contract
    precedence: 0
    probeIds:
      - validation-04
    status: active
    tags:
      - combined_pressure
      - rule_meaning
    textSha256: b90b7a2c1765169672cf9877e8fc8dc287db1ccbfff8306bb5d3c79c0e9da80f
  - behavioral: false
    harmful: 0
    helpful: 0
    id: r-a880f12553
    placements:
      - headingPath: *ref_3
    precedence: 0
    probeIds:
      - validation-02
    status: active
    tags:
      - exception_failure
      - precedence_order
      - rule_meaning
    textSha256: a880f12553b3fb4a19c413e56b3b2b39656dda2ef08f3fbcb40579271651f41d
description: >-
  Rule atoms placed in skills/aidx/references/execution-contract.md; derived
  from comprehension probe evidence.
schemaVersion: 1
sensitivity:
  - mutantsFlipped: 0
    mutantsTried: 1
    probeId: train-02
  - mutantsFlipped: 0
    mutantsTried: 1
    probeId: train-03
  - mutantsFlipped: 0
    mutantsTried: 1
    probeId: train-05
  - mutantsFlipped: 0
    mutantsTried: 1
    probeId: train-06
  - mutantsFlipped: 1
    mutantsTried: 1
    probeId: train-07
  - mutantsFlipped: 0
    mutantsTried: 2
    probeId: train-08
  - mutantsFlipped: 0
    mutantsTried: 1
    probeId: train-09
  - mutantsFlipped: 0
    mutantsTried: 2
    probeId: validation-01
  - mutantsFlipped: 0
    mutantsTried: 1
    probeId: validation-02
  - mutantsFlipped: 0
    mutantsTried: 1
    probeId: validation-04
  - mutantsFlipped: 1
    mutantsTried: 1
    probeId: validation-05
source: skills/aidx/references/execution-contract.md
tags:
  - atoms
title: Atom map for skills/aidx/references/execution-contract.md
type: atom-map
---
Atoms for `skills/aidx/references/execution-contract.md`.

| Atom | Placements | Probes |
| --- | --- | --- |
| `r-9e49b18f40` | AIDX execution contract | 1 |
| `r-f256abdb3b` | AIDX execution contract | 2 |
| `r-921533a949` | AIDX execution contract | 1 |
| `r-fa2022d6d8` | AIDX execution contract | 1 |
| `r-6672a0a86a` | AIDX execution contract | 2 |
| `r-899db8b544` | AIDX execution contract | 1 |
| `r-fec902be12` | AIDX execution contract | 1 |
| `r-d8ac8f0f3c` | AIDX execution contract | 1 |
| `r-1e95410ac2` | AIDX execution contract | 2 |
| `r-b90b7a2c17` | AIDX execution contract | 1 |
| `r-a880f12553` | AIDX execution contract | 1 |
