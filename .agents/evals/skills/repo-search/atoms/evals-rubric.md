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
      - train-06
    status: active
    tags:
      - rule_meaning
    textSha256: 8ee3ed35dd305789cca2e7468db62cf81e8affbf57327929287bad768efd8cba
  - behavioral: false
    harmful: 0
    helpful: 0
    id: r-c23b61a13a
    placements:
      - headingPath:
          - frontmatter
    precedence: 0
    probeIds:
      - validation-04
    status: active
    tags:
      - rule_meaning
    textSha256: c23b61a13a87768829432bb58436e6ec0b41cfe678a828fdd32dbab787ff11ce
  - behavioral: false
    harmful: 0
    helpful: 0
    id: r-888c28c3b9
    placements:
      - headingPath:
          - Repo Search Evaluation Rubric
    precedence: 0
    probeIds:
      - train-01
      - train-03
      - train-04
      - train-07
      - train-09
      - validation-02
      - validation-05
    status: active
    tags:
      - boundary
      - exception_failure
      - precedence_order
      - rule_meaning
    textSha256: 888c28c3b9b5d873e1437f2bb51db17e39d3f8ca6cf633a0345b4817727513f8
  - behavioral: false
    harmful: 0
    helpful: 0
    id: r-3f85d49571
    placements:
      - headingPath:
          - Repo Search Evaluation Rubric
    precedence: 0
    probeIds:
      - train-05
      - train-08
    status: active
    tags:
      - exception_failure
      - rule_meaning
    textSha256: 3f85d495711e4ac5f9458c036a8078f497218adb2b5b0fd3b8ad105b44152723
  - behavioral: false
    harmful: 0
    helpful: 0
    id: r-a7680ee4ac
    placements:
      - headingPath: &ref_0
          - Repo Search Evaluation Rubric
    precedence: 0
    probeIds:
      - validation-01
    status: active
    tags:
      - combined_pressure
      - precedence_order
      - rule_meaning
    textSha256: a7680ee4acc1293f421b0a9fe79ceac10e0ef1c077fa5105134c76b441bf59cc
  - behavioral: false
    harmful: 0
    helpful: 0
    id: r-daa9703d26
    placements:
      - headingPath: *ref_0
    precedence: 0
    probeIds:
      - train-02
    status: active
    tags:
      - combined_pressure
      - rule_meaning
    textSha256: daa9703d2657de31d538d3f1c4fcfc6dede0ced63173ed524ed50887cf7cd08b
  - behavioral: false
    harmful: 0
    helpful: 0
    id: r-806cf89966
    placements:
      - headingPath: *ref_0
    precedence: 0
    probeIds:
      - validation-03
    status: active
    tags:
      - rule_meaning
    textSha256: 806cf89966a63c82cd36d4d1acb200e236490f28ca8ec2c123dbd97007872fdd
description: >-
  Rule atoms placed in evals/skills/repo-search/rubric.md; derived from
  comprehension probe evidence.
schemaVersion: 1
sensitivity:
  - mutantsFlipped: 0
    mutantsTried: 2
    probeId: train-01
  - mutantsFlipped: 1
    mutantsTried: 1
    probeId: train-02
  - mutantsFlipped: 1
    mutantsTried: 2
    probeId: train-03
  - mutantsFlipped: 1
    mutantsTried: 2
    probeId: train-04
  - mutantsFlipped: 1
    mutantsTried: 1
    probeId: train-05
  - mutantsFlipped: 1
    mutantsTried: 1
    probeId: train-06
  - mutantsFlipped: 2
    mutantsTried: 2
    probeId: train-07
  - mutantsFlipped: 1
    mutantsTried: 1
    probeId: train-08
  - mutantsFlipped: 0
    mutantsTried: 2
    probeId: train-09
  - mutantsFlipped: 0
    mutantsTried: 1
    probeId: validation-01
  - mutantsFlipped: 1
    mutantsTried: 2
    probeId: validation-02
  - mutantsFlipped: 0
    mutantsTried: 1
    probeId: validation-03
  - mutantsFlipped: 0
    mutantsTried: 1
    probeId: validation-04
  - mutantsFlipped: 0
    mutantsTried: 2
    probeId: validation-05
source: evals/skills/repo-search/rubric.md
tags:
  - atoms
title: Atom map for evals/skills/repo-search/rubric.md
type: atom-map
---
Atoms for `evals/skills/repo-search/rubric.md`.

| Atom | Placements | Probes |
| --- | --- | --- |
| `r-8ee3ed35dd` | frontmatter | 1 |
| `r-c23b61a13a` | frontmatter | 1 |
| `r-888c28c3b9` | Repo Search Evaluation Rubric | 7 |
| `r-3f85d49571` | Repo Search Evaluation Rubric | 2 |
| `r-a7680ee4ac` | Repo Search Evaluation Rubric | 1 |
| `r-daa9703d26` | Repo Search Evaluation Rubric | 1 |
| `r-806cf89966` | Repo Search Evaluation Rubric | 1 |
