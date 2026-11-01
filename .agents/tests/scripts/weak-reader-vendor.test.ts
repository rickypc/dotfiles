import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import path from 'node:path';
import {
  KV_CAPACITY_GLOBAL,
  VENDORED_BUNDLE_PATH,
  VENDORED_BUNDLE_SHA256,
} from '../../scripts/weak-reader.js';

// Asset integrity check for the committed runtime bundle; it exercises no production code.
describe('vendored Gemma 4 E2B runtime bundle', () => {
  const archive = path.join(import.meta.dir, '..', '..', VENDORED_BUNDLE_PATH);
  const loadSource = async (): Promise<string> =>
    new TextDecoder().decode(Bun.gunzipSync(await Bun.file(archive).bytes()));

  test('decompresses to exactly the pinned sha256', async () => {
    const digest = createHash('sha256')
      .update(await loadSource())
      .digest('hex');

    expect(digest).toBe(VENDORED_BUNDLE_SHA256);
  });

  test('carries the two documented edits and exports the model class', async () => {
    const source = await loadSource();

    expect(source).toContain(`var Us=globalThis.${KV_CAPACITY_GLOBAL}??8192,`);
    expect(source).toContain('this.#o.cache.truncate(o),this.#u=this.#u.slice(0,o)');
    expect(source).not.toContain('(this.#c(),o=0);');
    expect(source).toMatch(/export\s*\{[^}]*\bas Gemma4Mobile\b/u);
  });
});
