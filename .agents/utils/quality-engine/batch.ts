export type BatchMode = 'exclusive' | 'read-only';

export interface BatchResult<T> {
  readonly id: string;
  readonly value: T;
}

export interface BatchTask<T> {
  readonly id: string;
  readonly mode: BatchMode;
  readonly run: () => Promise<T>;
}

const validateTasks = <T>(tasks: readonly BatchTask<T>[]): void => {
  const ids = new Set<string>();
  for (const task of tasks) {
    if (!task.id.trim() || ids.has(task.id)) {
      throw new Error(`Batch task ID must be unique: ${task.id}`);
    }
    ids.add(task.id);
  }
};

export const runBatched = async <T>(
  tasks: readonly BatchTask<T>[],
): Promise<BatchResult<T>[]> => {
  validateTasks(tasks);
  const readOnly = tasks.filter((task) => task.mode === 'read-only');
  const exclusive = tasks.filter((task) => task.mode === 'exclusive');
  const readOnlyResults = await Promise.all(
    readOnly.map(async (task) => ({ id: task.id, value: await task.run() })),
  );
  const exclusiveResults: BatchResult<T>[] = [];
  for (const task of exclusive) {
    exclusiveResults.push({ id: task.id, value: await task.run() });
  }
  return [...readOnlyResults, ...exclusiveResults];
};
