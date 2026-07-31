import {
  canonicalTestPathFor,
  convertJestToBun,
  renderBunTestTemplate,
  testPathFor,
  validateBunTestSource,
  validateExternalDependencyMocks,
} from '../utils/bun-test-generator.js';
import { runWhenMain as runCliWhenMain } from '../utils/cli.js';

const runPathCommand = (
  command: string,
  first: string | undefined,
  second: string | undefined,
  rest: readonly string[],
  length: number,
  write: (message: string) => void,
): boolean => {
  if (command === 'test-path' && first && second && length === 3) {
    write(testPathFor(first, second));
    return true;
  }
  if (command === 'canonical-path' && first && second && length >= 3) {
    write(canonicalTestPathFor(first, [second, ...rest]));
    return true;
  }
  return false;
};

export const usage = (): string =>
  'Usage: bun ~/.agents/scripts/bun-test-generator.ts <test-path|canonical-path|validate-source|validate-boundaries|template|convert-jest> <arguments>';

const validateBoundaries = (input: string): void => {
  const parsed = JSON.parse(input) as {
    readonly sutSource?: unknown;
    readonly testSource?: unknown;
  };
  if (
    typeof parsed.sutSource !== 'string' ||
    typeof parsed.testSource !== 'string'
  ) {
    throw new Error(
      'Boundary validation requires string sutSource and testSource.',
    );
  }
  validateBunTestSource(parsed.testSource);
  validateExternalDependencyMocks(parsed.sutSource, parsed.testSource);
};

const runContentCommand = (
  command: string,
  first: string | undefined,
  length: number,
  write: (message: string) => void,
): boolean => {
  if (command === 'validate-source' && first && length === 2) {
    validateBunTestSource(first);
    write('bun-test-source: passed');
    return true;
  }
  if (command === 'validate-boundaries' && first && length === 2) {
    validateBoundaries(first);
    write('bun-test-boundaries: passed');
    return true;
  }
  if (command === 'template' && first && length === 2) {
    write(renderBunTestTemplate(JSON.parse(first)));
    return true;
  }
  if (command === 'convert-jest' && first && length === 2) {
    write(convertJestToBun(first));
    return true;
  }
  return false;
};

export const run = (
  args: readonly string[],
  write: (message: string) => void = console.log,
): void => {
  const [command, first, second, ...rest] = args;
  if (runPathCommand(command, first, second, rest, args.length, write)) return;
  if (runContentCommand(command, first, args.length, write)) return;
  throw new Error(usage());
};

export const runWhenMain = runCliWhenMain;

runWhenMain(import.meta.main, Bun.argv.slice(2), run);
