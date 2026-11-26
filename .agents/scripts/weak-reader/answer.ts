interface OptionAccumulator {
  duplicate: boolean;
  readonly values: Map<string, string>;
}

export const NO_ANSWER = 'NONE';

const optionsIn = (query: string): ReadonlyMap<string, string> => {
  const state: OptionAccumulator = { duplicate: false, values: new Map() };
  for (const line of query.split(/\r?\n/u)) {
    const option = /^\s*([A-F])[.)]\s*(.*?)\s*$/u.exec(line);
    if (!option) {
      continue;
    }
    const label = option[1] ?? '';
    if (state.values.has(label)) {
      state.duplicate = true;
    }
    state.values.set(label, (option[2] ?? '').trim());
  }
  return state.duplicate || state.values.size < 2 ? new Map() : state.values;
};

export const optionTextFor = (query: string, label: string): string | undefined =>
  /^[A-F]$/u.test(label) ? optionsIn(query).get(label) : undefined;

const selectedLabelOf = (reply: string): string => {
  const selected = /^Answer:[ \t]*([A-F]|NONE)$/u.exec(reply.trim().replace(/\r\n/gu, '\n'));
  return selected?.[1] ?? '';
};

export const parseAnswer = (reply: string, query: string): string => {
  const options = optionsIn(query);
  if (options.size < 2) {
    return '';
  }
  const selected = selectedLabelOf(reply);
  if (selected === NO_ANSWER) {
    return NO_ANSWER;
  }
  return options.has(selected) ? selected : '';
};
