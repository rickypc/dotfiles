---
atoms:
  - behavioral: false
    harmful: 0
    helpful: 0
    id: r-8ee3ed35dd
    placements:
      - headingPath:
          - frontmatter
    precedence: 0
    probeIds:
      - validation-01
    status: active
    tags:
      - rule_meaning
    textSha256: 8ee3ed35dd305789cca2e7468db62cf81e8affbf57327929287bad768efd8cba
  - behavioral: false
    harmful: 0
    helpful: 0
    id: r-b17f9d3052
    placements:
      - headingPath:
          - frontmatter
    precedence: 0
    probeIds:
      - train-05
    status: active
    tags:
      - rule_meaning
    textSha256: b17f9d3052eed91ec3f6eedaac9b05ff394e8e233a2245520049f113eaafa7bc
  - behavioral: false
    harmful: 0
    helpful: 0
    id: r-c23b61a13a
    placements:
      - headingPath:
          - frontmatter
    precedence: 0
    probeIds:
      - validation-02
    status: active
    tags:
      - boundary
      - rule_meaning
    textSha256: c23b61a13a87768829432bb58436e6ec0b41cfe678a828fdd32dbab787ff11ce
  - behavioral: false
    harmful: 0
    helpful: 0
    id: r-f74dc9a964
    placements:
      - headingPath:
          - frontmatter
    precedence: 0
    probeIds:
      - validation-04
    status: active
    tags:
      - rule_meaning
    textSha256: f74dc9a9649e21b5e9c7dedfbd19ada747510a47580074cbc3540bcf4f7206ba
  - behavioral: false
    harmful: 0
    helpful: 0
    id: r-ef9c34b4b5
    placements:
      - headingPath:
          - frontmatter
    precedence: 0
    probeIds:
      - train-06
    status: active
    tags:
      - rule_meaning
    textSha256: ef9c34b4b5f386bd2983d871ba875d7c83c4da21e26a8958f0e5639e0170c048
  - behavioral: false
    harmful: 0
    helpful: 0
    id: r-eed2b27802
    placements:
      - headingPath: &ref_0
          - AIDP evaluation rubric
    precedence: 0
    probeIds:
      - train-01
    status: active
    tags:
      - boundary
      - exception_failure
      - rule_meaning
    textSha256: eed2b27802d453155749f11a286ee55b171cfa18a8540742f5c3a472ba53229a
  - behavioral: false
    harmful: 0
    helpful: 0
    id: r-3e0765e4cb
    placements:
      - headingPath: *ref_0
    precedence: 0
    probeIds:
      - train-04
    status: active
    tags:
      - exception_failure
      - rule_meaning
    textSha256: 3e0765e4cb2842a6d1c7b8bb78fc9ef7c4f2061b15f7fa55ee9d53db3014291e
  - behavioral: false
    harmful: 0
    helpful: 0
    id: r-6bdd89877c
    placements:
      - headingPath: &ref_1
          - AIDP evaluation rubric
    precedence: 0
    probeIds:
      - train-03
      - train-07
      - validation-03
    status: active
    tags:
      - precedence_order
      - rule_meaning
    textSha256: 6bdd89877cbb35aef5b6be0f7a5dc23a0a90b5ffbb301c50c85b635ce29b19ca
  - behavioral: false
    harmful: 0
    helpful: 0
    id: r-03661dad50
    placements:
      - headingPath: *ref_1
    precedence: 0
    probeIds:
      - train-02
    status: active
    tags:
      - precedence_order
      - rule_meaning
    textSha256: 03661dad5038d7d8bfb0bc0658c1f7a70d8ef183eb4faa21412d899c84e9d8d8
description: >-
  Rule atoms placed in evals/skills/aidp/rubric.md; derived from comprehension
  probe evidence.
schemaVersion: 1
sensitivity:
  - mutantsFlipped: 0
    mutantsTried: 1
    probeId: train-01
  - mutantsFlipped: 0
    mutantsTried: 1
    probeId: train-02
  - mutantsFlipped: 0
    mutantsTried: 1
    probeId: train-03
  - mutantsFlipped: 0
    mutantsTried: 1
    probeId: train-04
  - mutantsFlipped: 1
    mutantsTried: 1
    probeId: train-05
  - mutantsFlipped: 1
    mutantsTried: 1
    probeId: train-06
  - mutantsFlipped: 1
    mutantsTried: 1
    probeId: train-07
  - mutantsFlipped: 0
    mutantsTried: 1
    probeId: validation-01
  - mutantsFlipped: 1
    mutantsTried: 1
    probeId: validation-02
  - mutantsFlipped: 0
    mutantsTried: 1
    probeId: validation-03
source: evals/skills/aidp/rubric.md
tags:
  - atoms
title: Atom map for evals/skills/aidp/rubric.md
type: atom-map
---
Atoms for `evals/skills/aidp/rubric.md`.

| Atom | Placements | Probes |
| --- | --- | --- |
| `r-8ee3ed35dd` | frontmatter | 1 |
| `r-b17f9d3052` | frontmatter | 1 |
| `r-c23b61a13a` | frontmatter | 1 |
| `r-f74dc9a964` | frontmatter | 1 |
| `r-ef9c34b4b5` | frontmatter | 1 |
| `r-eed2b27802` | AIDP evaluation rubric | 1 |
| `r-3e0765e4cb` | AIDP evaluation rubric | 1 |
| `r-6bdd89877c` | AIDP evaluation rubric | 3 |
| `r-03661dad50` | AIDP evaluation rubric | 1 |
