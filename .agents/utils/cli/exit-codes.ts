export const EXIT_CODES = { failure: 1, success: 0, usage: 2 } as const;

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];
