import { describe, expect, test } from 'bun:test';

// The SUT is a pure module with no imports, so there is no external boundary to register: every
// case feeds fixed fixture strings and asserts the returned findings.
const { consistencyIssues } = await import('../../../scripts/plans/aidp-consistency.js');

interface Parts {
  readonly output?: string;
  readonly target?: string;
  readonly workflow?: string;
}

const defaultOutput = [
  'AIDX final response uses these two labels, in this order:',
  '',
  '1. `Outcome:` one sentence.',
  '2. `Next action:` one decision.',
].join('\n');

const phase = (number: number, name: string, deliverable: boolean): string =>
  [
    `### Phase ${number} - ${name}`,
    '',
    `Phase inputs: inputs. Completion criteria: ${deliverable ? 'Deliverable: done.' : 'done.'} Resume point: next.`,
    '',
    '- [ ] Target: parser module; Responsibility: AIDX; Proof: test.',
  ].join('\n');

const register = [
  '**Predicted deviations (pre-approved responses).**',
  '',
  '| Id | Trigger | Response | Budget |',
  '| --- | --- | --- | --- |',
  '| PD-1 | noise | record it | 1 |',
].join('\n');

const twoPhases = `${phase(1, 'Preflight and spikes', true)}\n\n${phase(2, 'Apply', true)}`;

const build = (parts: Parts = {}) => {
  const target = parts.target ?? '**Objective.** deliver.';
  const workflow = parts.workflow ?? phase(1, 'Apply', true);
  const output = parts.output ?? defaultOutput;
  const sections = {
    'CHRONOLOGICAL WORKFLOW': workflow,
    'RIGID OUTPUT SCHEMA': output,
    'TARGET DIRECTIVES': target,
  };
  return { body: [target, workflow, output].join('\n\n'), sections };
};

const issuesFor = (parts?: Parts): readonly string[] => {
  const { body, sections } = build(parts);
  return consistencyIssues(body, sections);
};

describe('label count', () => {
  test('rejects a word count that differs from the listed labels', () => {
    const issues = issuesFor({
      target: '**Objective.** Done means all five labels are populated.',
    });
    expect(issues).toEqual(['Plan states five output labels but RIGID OUTPUT SCHEMA lists 2.']);
  });

  test('rejects a digit count that differs from the listed labels', () => {
    expect(issuesFor({ target: 'The schema has 3 labels.' })).toHaveLength(1);
  });

  test('accepts word and digit counts that match the listed labels', () => {
    expect(
      issuesFor({ target: 'Done means all two output labels; Section 6 lists 2 labels.' }),
    ).toEqual([]);
  });

  test('ignores a claim when the schema lists no numbered labels', () => {
    expect(issuesFor({ output: 'Free-form schema.', target: 'There are nine labels.' })).toEqual(
      [],
    );
  });
});

describe('exclusion cover', () => {
  const exclusion = '- Exclusion E-1 | covers: AGENTS.md, python | Never edited.';

  test('rejects an Included scope paragraph that names a covered token', () => {
    const issues = issuesFor({
      target: `**Included scope.** Edit \`AGENTS.md\` here.\n\n${exclusion}`,
    });
    expect(issues).toEqual(['Included scope names "AGENTS.md", which Exclusion E-1 excludes.']);
  });

  test('rejects a workflow step whose Target field edits a covered token', () => {
    const issues = issuesFor({
      target: exclusion,
      workflow: '- [ ] Target: rewrite python helper; Responsibility: AIDX; Proof: test.',
    });
    expect(issues).toEqual(['Workflow step 1 targets "python", which Exclusion E-1 excludes.']);
  });

  test('accepts a covered token that is only proposed as a diff or kept unchanged', () => {
    const issues = issuesFor({
      target: `**Included scope.** Scripts only.\n\n${exclusion}`,
      workflow: '- [ ] Target: proposed `AGENTS.md` change as a diff; Responsibility: AIDX.',
    });
    expect(issues).toEqual([]);
  });

  test('accepts a step with no Target field and a token that only appears elsewhere', () => {
    const issues = issuesFor({
      target: exclusion,
      workflow: '- [ ] Run the final gate; Preserved: python files untouched.',
    });
    expect(issues).toEqual([]);
  });

  test('does not match a token embedded inside a longer word', () => {
    const issues = issuesFor({
      target: exclusion,
      workflow: '- [ ] Target: pythonic naming helper; Responsibility: AIDX.',
    });
    expect(issues).toEqual([]);
  });
});

describe('count register', () => {
  test('rejects the same noun with two different numbers', () => {
    const issues = issuesFor({
      target: '| Count C-1 | widgets = 3 | x |\n| Count C-2 | widgets = 4 | x |',
    });
    expect(issues).toEqual(['Count register gives "widgets" as both 3 and 4.']);
  });

  test('rejects a label count that differs from the listed labels', () => {
    const issues = issuesFor({ target: '| `Count C-1` | output labels = 9 | integer |' });
    expect(issues).toEqual(['Count register states 9 output labels but the plan holds 2.']);
  });

  test('rejects a phase count that differs from the phase blocks', () => {
    const issues = issuesFor({ target: 'Count C-2: phases = 5' });
    expect(issues).toEqual(['Count register states 5 phases but the plan holds 1.']);
  });

  test('accepts a consistent register including an unbound noun', () => {
    const issues = issuesFor({
      target:
        '| `Count C-1` | output labels = 2 | x |\nCount C-2: phases = 1\nCount C-3: widgets = 7\nCount C-4: widgets = 7',
    });
    expect(issues).toEqual([]);
  });
});

describe('cap arithmetic', () => {
  test('rejects a wrong product', () => {
    expect(issuesFor({ target: '| Cap | 2 x 3 = 7 | base x multiplier |' })).toEqual([
      'Cap arithmetic 2 x 3 = 7 is wrong; the product is 6.',
    ]);
  });

  test('rejects an execution-section cap with no registered arithmetic', () => {
    const issues = issuesFor({
      workflow: `${phase(1, 'Apply', true)}\n\nCommands stay within the cap of 9.`,
    });
    expect(issues).toEqual(['Cap of 9 has no matching base x multiplier = cap arithmetic.']);
  });

  test('accepts a cap that matches registered arithmetic and ignores evidence history', () => {
    const issues = issuesFor({
      target: '| Cap | 2 x 3 = 6 | x |\nHistory: ran against a cap of 7.',
      workflow: `${phase(1, 'Apply', true)}\n\nCommands stay within the cap of 6.`,
    });
    expect(issues).toEqual([]);
  });
});

describe('evidence stamp', () => {
  test('rejects an evidence bullet with no verification stamp', () => {
    const issues = issuesFor({
      target: '**Evidence record**\n\n- The file has 444 lines.\n\n**Next heading**',
    });
    expect(issues).toEqual([
      'Evidence record bullet lacks a verification stamp: "- The file has 444 lines."',
    ]);
  });

  test('accepts stamped bullets with verified, receipt, and evidence markers', () => {
    const issues = issuesFor({
      target: [
        '**Evidence record**',
        '',
        '- One (verified today by reading it).',
        '- Two (receipt: command output).',
        '- Three (evidence: the test run).',
        '',
        '**Next heading**',
      ].join('\n'),
    });
    expect(issues).toEqual([]);
  });

  test('checks the final bullet when the evidence record ends the section', () => {
    expect(issuesFor({ target: '**Evidence record**\n\n- Bare claim.' })).toHaveLength(1);
  });
});

describe('predicted-deviation register', () => {
  test('rejects a multi-phase plan with no register', () => {
    const issues = issuesFor({ workflow: twoPhases });
    expect(issues).toEqual([
      'Plan must declare a Predicted deviations table with PD-n rows in TARGET DIRECTIVES.',
    ]);
  });

  test('rejects an empty cell, a duplicate id, and an unknown reference', () => {
    const target = [
      register,
      '| PD-1 | again | respond | 1 |',
      '| PD-2 | trigger |  | 1 |',
      'Use PD-9 here.',
    ].join('\n');
    const issues = issuesFor({ target, workflow: twoPhases });
    expect(issues).toEqual([
      'Predicted deviations id PD-1 is declared more than once.',
      'Predicted deviations row PD-2 has an empty cell.',
      'Plan references PD-9, which the Predicted deviations table does not declare.',
    ]);
  });

  test('accepts a complete register and does not apply to a single phase', () => {
    expect(issuesFor({ target: register, workflow: twoPhases })).toEqual([]);
    expect(issuesFor({ workflow: phase(1, 'Apply', true) })).toEqual([]);
  });
});

describe('preflight phase and deliverable criterion', () => {
  test('rejects a multi-phase plan whose first phase is not a preflight', () => {
    const workflow = `${phase(1, 'Apply', true)}\n\n${phase(2, 'Close', true)}`;
    expect(issuesFor({ target: register, workflow })).toEqual([
      'Phase 1 must be a Preflight phase when the plan has two or more phases.',
    ]);
  });

  test('rejects a phase whose completion criteria name no deliverable', () => {
    const workflow = `${phase(1, 'Preflight', true)}\n\n${phase(2, 'Close', false)}`;
    expect(issuesFor({ target: register, workflow })).toEqual([
      'Phase 2 completion criteria must state a Deliverable:.',
    ]);
  });

  test('accepts a plan with no phase headings', () => {
    expect(issuesFor({ workflow: '- [ ] Target: one step.' })).toEqual([]);
  });
});
