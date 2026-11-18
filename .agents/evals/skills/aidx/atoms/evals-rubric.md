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
      - train-02
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
      - train-06
      - validation-01
      - validation-03
      - validation-04
      - validation-05
    status: active
    tags:
      - precedence_order
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
      - train-03
    status: active
    tags:
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
      - validation-02
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
      - train-04
    status: active
    tags:
      - rule_meaning
    textSha256: ef9c34b4b5f386bd2983d871ba875d7c83c4da21e26a8958f0e5639e0170c048
  - behavioral: false
    harmful: 0
    helpful: 0
    id: r-04d35080de
    placements:
      - headingPath: &ref_0
          - AIDX evaluation rubric
    precedence: 0
    probeIds:
      - train-01
      - train-08
    status: active
    tags:
      - boundary
      - rule_meaning
    textSha256: 04d35080dec5ba08299d3580e7a824b3a178ed18d88916f70f1fa236ae5bafc8
  - behavioral: false
    harmful: 0
    helpful: 0
    id: r-3ed88417f8
    placements:
      - headingPath: *ref_0
    precedence: 0
    probeIds:
      - train-05
      - train-07
    status: active
    tags:
      - exception_failure
      - precedence_order
      - rule_meaning
    textSha256: 3ed88417f8d424325c5051425400bd9f38d5bbd2ef73c64597dd484d99c48524
description: >-
  Rule atoms placed in evals/skills/aidx/rubric.md; derived from comprehension
  probe evidence.
schemaVersion: 1
sensitivity:
  - mutantsFlipped: 0
    mutantsTried: 1
    probeId: train-01
  - mutantsFlipped: 1
    mutantsTried: 1
    probeId: train-02
  - mutantsFlipped: 1
    mutantsTried: 1
    probeId: train-03
  - mutantsFlipped: 1
    mutantsTried: 1
    probeId: train-04
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
    mutantsTried: 1
    probeId: train-08
  - mutantsFlipped: 0
    mutantsTried: 1
    probeId: validation-01
  - mutantsFlipped: 0
    mutantsTried: 1
    probeId: validation-02
  - mutantsFlipped: 0
    mutantsTried: 1
    probeId: validation-03
  - mutantsFlipped: 0
    mutantsTried: 1
    probeId: validation-04
  - mutantsFlipped: 0
    mutantsTried: 1
    probeId: validation-05
source: evals/skills/aidx/rubric.md
tags:
  - atoms
title: Atom map for evals/skills/aidx/rubric.md
type: atom-map
---
Atoms for `evals/skills/aidx/rubric.md`.

| Atom | Placements | Probes |
| --- | --- | --- |
| `r-8ee3ed35dd` | frontmatter | 1 |
| `r-b17f9d3052` | frontmatter | 5 |
| `r-c23b61a13a` | frontmatter | 1 |
| `r-f74dc9a964` | frontmatter | 1 |
| `r-ef9c34b4b5` | frontmatter | 1 |
| `r-04d35080de` | AIDX evaluation rubric | 2 |
| `r-3ed88417f8` | AIDX evaluation rubric | 2 |
