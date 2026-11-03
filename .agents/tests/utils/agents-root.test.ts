import { describe, expect, mock, test } from 'bun:test';
import { AGENTS_ROOT_FLAG, splitAgentsRoot } from '../../utils/agents-root.js';

const listing = mock(async (directory: string) => {
  if (directory === '/missing') {
    throw new Error('ENOENT');
  }
  if (directory === '/with-evals') {
    return [{ isDirectory: true, name: 'evals' }];
  }
  return directory === '/empty'
    ? [{ isDirectory: false, name: 'skills' }]
    : [{ isDirectory: true, name: 'skills' }];
});

describe('splitAgentsRoot', () => {
  test('returns the arguments untouched when the flag is absent', async () => {
    expect(await splitAgentsRoot(['a.md'], listing)).toEqual({ rest: ['a.md'] });
  });

  test.each(['/project/.agents', '/with-evals'])('accepts %s and strips the flag', async (root) => {
    expect(await splitAgentsRoot([AGENTS_ROOT_FLAG, root, 'a.md'], listing)).toEqual({
      rest: ['a.md'],
      root,
    });
  });

  test.each([
    [['relative/path'], 'an absolute path'],
    [['/project/../etc'], 'without ".." segments'],
    [[], 'an absolute path'],
    [['/missing'], 'an existing directory'],
    [['/empty'], 'a skills or evals directory'],
  ])('rejects the root %p', async (value, message) => {
    await expect(splitAgentsRoot([AGENTS_ROOT_FLAG, ...value], listing)).rejects.toThrow(message);
  });
});
