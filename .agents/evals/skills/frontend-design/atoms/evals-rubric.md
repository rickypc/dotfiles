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
      - validation-02
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
      - validation-01
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
      - validation-05
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
      - validation-04
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
          - Frontend Design Evaluation Rubric
    precedence: 0
    probeIds:
      - train-08
    status: active
    tags:
      - boundary
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
      - train-09
      - validation-03
    status: active
    tags:
      - boundary
      - exception_failure
      - rule_meaning
    textSha256: 3067ac1c7b1ca18def64f02e73dc99350fca7e9c429bc3fb22c133386984dd3d
  - behavioral: false
    harmful: 0
    helpful: 0
    id: r-dcaf813df4
    placements:
      - headingPath: &ref_1
          - Frontend Design Evaluation Rubric
    precedence: 0
    probeIds:
      - train-01
      - train-02
    status: active
    tags:
      - combined_pressure
      - exception_failure
      - precedence_order
      - rule_meaning
    textSha256: dcaf813df47ae19e26ed887f83e47979d95c2e15bc6bf111898a517ce27a8db8
  - behavioral: false
    harmful: 0
    helpful: 0
    id: r-ea27af8ece
    placements:
      - headingPath: *ref_1
    precedence: 0
    probeIds:
      - train-01
      - train-02
    status: active
    tags:
      - combined_pressure
      - exception_failure
      - precedence_order
      - rule_meaning
    textSha256: ea27af8ece5d55c0aaaef158fab6aff46194b3d618c47266d4441065ca46f8a1
  - behavioral: false
    harmful: 0
    helpful: 0
    id: r-0167516474
    placements:
      - headingPath: &ref_2
          - Frontend Design Evaluation Rubric
    precedence: 0
    probeIds:
      - train-03
      - train-04
    status: active
    tags:
      - boundary
      - combined_pressure
      - exception_failure
      - precedence_order
      - rule_meaning
    textSha256: 016751647411828baaa0b22513a2400a136070e515e216c036abd96a0c970c13
  - behavioral: false
    harmful: 0
    helpful: 0
    id: r-1df2bacb2f
    placements:
      - headingPath: *ref_2
    precedence: 0
    probeIds:
      - train-04
    status: active
    tags:
      - boundary
      - combined_pressure
      - exception_failure
      - precedence_order
      - rule_meaning
    textSha256: 1df2bacb2f01f5c517a51dd269c54b36612bccf7946b690f76055a727e14b174
  - behavioral: false
    harmful: 0
    helpful: 0
    id: r-032df10dc2
    placements:
      - headingPath: &ref_3
          - Frontend Design Evaluation Rubric
    precedence: 0
    probeIds:
      - train-05
      - train-06
    status: active
    tags:
      - boundary
      - combined_pressure
      - precedence_order
      - rule_meaning
    textSha256: 032df10dc278893bd4a7a22beb0157a9d0f6396b1f952ebc52551b847091495b
  - behavioral: false
    harmful: 0
    helpful: 0
    id: r-bd7dd37945
    placements:
      - headingPath: *ref_3
    precedence: 0
    probeIds:
      - train-10
    status: active
    tags:
      - rule_meaning
    textSha256: bd7dd37945c497bcab44af0a5340979e7fed9110f2ea8931c98dd67de71ead88
description: >-
  Rule atoms placed in evals/skills/frontend-design/rubric.md; derived from
  comprehension probe evidence.
schemaVersion: 1
sensitivity:
  - mutantsFlipped: 1
    mutantsTried: 2
    probeId: train-01
  - mutantsFlipped: 0
    mutantsTried: 2
    probeId: train-02
  - mutantsFlipped: 0
    mutantsTried: 2
    probeId: train-05
  - mutantsFlipped: 0
    mutantsTried: 2
    probeId: train-06
  - mutantsFlipped: 0
    mutantsTried: 1
    probeId: train-07
  - mutantsFlipped: 1
    mutantsTried: 2
    probeId: train-09
  - mutantsFlipped: 1
    mutantsTried: 1
    probeId: train-10
  - mutantsFlipped: 1
    mutantsTried: 1
    probeId: validation-01
  - mutantsFlipped: 0
    mutantsTried: 1
    probeId: validation-02
  - mutantsFlipped: 0
    mutantsTried: 2
    probeId: validation-03
  - mutantsFlipped: 1
    mutantsTried: 1
    probeId: validation-04
source: evals/skills/frontend-design/rubric.md
tags:
  - atoms
title: Atom map for evals/skills/frontend-design/rubric.md
type: atom-map
---
Atoms for `evals/skills/frontend-design/rubric.md`.

| Atom | Placements | Probes |
| --- | --- | --- |
| `r-8ee3ed35dd` | frontmatter | 1 |
| `r-b17f9d3052` | frontmatter | 1 |
| `r-c23b61a13a` | frontmatter | 1 |
| `r-f74dc9a964` | frontmatter | 1 |
| `r-ef9c34b4b5` | frontmatter | 1 |
| `r-cab64e4d49` | Frontend Design Evaluation Rubric | 1 |
| `r-3067ac1c7b` | Frontend Design Evaluation Rubric | 2 |
| `r-dcaf813df4` | Frontend Design Evaluation Rubric | 2 |
| `r-ea27af8ece` | Frontend Design Evaluation Rubric | 2 |
| `r-0167516474` | Frontend Design Evaluation Rubric | 2 |
| `r-1df2bacb2f` | Frontend Design Evaluation Rubric | 1 |
| `r-032df10dc2` | Frontend Design Evaluation Rubric | 2 |
| `r-bd7dd37945` | Frontend Design Evaluation Rubric | 1 |
