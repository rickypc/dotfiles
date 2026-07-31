export interface CheckResult {
  readonly detail: string;
  readonly name: string;
  readonly status: CheckStatus;
}

export type CheckStatus = 'passed' | 'failed' | 'not-applicable' | 'blocked';

export interface CommandResult {
  readonly code: number;
  readonly stderr: string;
  readonly stdout: string;
}

export interface CommandSpec {
  readonly args: readonly string[];
  readonly command: string;
  readonly cwd?: string;
  readonly environment?: Readonly<Record<string, string>>;
}

export const failed = (name: string, detail: string): CheckResult => ({
  detail,
  name,
  status: 'failed',
});

export const normalizePaths = (paths: readonly string[]): string[] => {
  const normalized = [
    ...new Set(paths.map((path) => path.trim()).filter(Boolean)),
  ];
  if (normalized.length === 0) {
    throw new Error('At least one path is required.');
  }
  return normalized;
};

export const passed = (name: string, detail: string): CheckResult => ({
  detail,
  name,
  status: 'passed',
});
