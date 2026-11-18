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
      - train-07
      - validation-02
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
      - train-03
      - train-06
    status: active
    tags:
      - boundary
      - exception_failure
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
      - validation-03
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
    id: r-cab64e4d49
    placements:
      - headingPath: &ref_0
          - Knowledge Base Evaluation Rubric
    precedence: 0
    probeIds:
      - train-05
      - train-08
      - validation-01
      - validation-05
    status: active
    tags:
      - boundary
      - exception_failure
      - precedence_order
      - rule_meaning
    textSha256: cab64e4d49d257656bd6135edd65bb02546754024a71c9e0f9972af7597ebec9
  - behavioral: false
    harmful: 0
    helpful: 0
    id: r-3067ac1c7b
    placements:
      - headingPath: *ref_0
    precedence: 0
    probeIds:
      - train-05
      - validation-04
    status: active
    tags:
      - boundary
      - exception_failure
      - rule_meaning
    textSha256: 3067ac1c7b1ca18def64f02e73dc99350fca7e9c429bc3fb22c133386984dd3d
  - behavioral: false
    harmful: 0
    helpful: 0
    id: r-8ab7cca826
    placements:
      - headingPath:
          - Knowledge Base Evaluation Rubric
    precedence: 0
    probeIds:
      - train-01
      - train-09
    status: active
    tags:
      - rule_meaning
    textSha256: 8ab7cca82626480c83730a2df69af04a428243d01fa2d4206eba847e2c417496
description: >-
  Rule atoms placed in evals/skills/knowledge-base/rubric.md; derived from
  comprehension probe evidence.
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
  - mutantsFlipped: 1
    mutantsTried: 1
    probeId: train-04
  - mutantsFlipped: 0
    mutantsTried: 3
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
    probeId: train-09
  - mutantsFlipped: 1
    mutantsTried: 1
    probeId: validation-01
  - mutantsFlipped: 1
    mutantsTried: 1
    probeId: validation-02
  - mutantsFlipped: 0
    mutantsTried: 1
    probeId: validation-03
  - mutantsFlipped: 1
    mutantsTried: 2
    probeId: validation-04
  - mutantsFlipped: 0
    mutantsTried: 1
    probeId: validation-05
source: evals/skills/knowledge-base/rubric.md
tags:
  - atoms
title: Atom map for evals/skills/knowledge-base/rubric.md
type: atom-map
---
Atoms for `evals/skills/knowledge-base/rubric.md`.

| Atom | Placements | Probes |
| --- | --- | --- |
| `r-8ee3ed35dd` | frontmatter | 1 |
| `r-b17f9d3052` | frontmatter | 2 |
| `r-c23b61a13a` | frontmatter | 2 |
| `r-f74dc9a964` | frontmatter | 1 |
| `r-ef9c34b4b5` | frontmatter | 1 |
| `r-cab64e4d49` | Knowledge Base Evaluation Rubric | 4 |
| `r-3067ac1c7b` | Knowledge Base Evaluation Rubric | 2 |
| `r-8ab7cca826` | Knowledge Base Evaluation Rubric | 2 |
