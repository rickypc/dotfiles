# Lessons Learned: Avoiding Hanging/Slow Tests

## <pattern:hanging-stdin>

**Problem**: Tests that read from `stdin` (e.g., `Bun.stdin`, `process.stdin`,
`new Response(Bun.stdin).text()`) hang indefinitely in test environments because no input is
provided.

**Solution**: Always inject `readInput` / stdin reader as a dependency and mock it in tests.

```ts
// SUT: accept readInput as dependency
const defaultDependencies = {
  readInput: async () => new Response(Bun.stdin).text(),
  // ...
};

// Test: mock readInput to return immediately
const mockStdin = mock(async () => '{invalid json}');
await run(args, { ...defaultDependencies, readInput: mockStdin });
```

**Anti-pattern**: Using default stdin reader in tests without mocking.

## <pattern:focused-green-full-gate-red>

**Problem**: A focused test or coverage command passes, but the full Bun suite fails later because a
persistent `mock.module()` registration changed a default dependency, or because strict TypeScript
and lint were never run. This is easy to miss when the selected SUT reports 100% coverage.

**Solution**: Treat focused coverage as diagnostic evidence only. Run the configured full project
lanes independently after the focused check: `test:lint`, `test:unit`, and `test:type` when those
scripts exist. Require every lane to exit 0, retain each receipt, and rerun the full suite after any
mock or fixture repair. The coverage receipt must name the selected SUT files and show 100% of the
configured function/line metrics; aggregate coverage is not enough.

**Anti-pattern**: Declaring completion from a focused 100% report or from `test:lint` while
`test:unit` or `test:type` remains unverified.

## <pattern:same-process-built-in-mock>

**Problem**: Bun module mocks can persist across test files in one process. A top-level built-in
mock such as `node:os` may replace a platform value used by a later test, making a default path,
temporary root, or other OS boundary inconsistent. The focused file passes while the full suite
fails due to test ordering.

**Solution**: Prefer dependency injection or the real platform value when it already provides a
deterministic boundary. If a built-in module mock is unavoidable, preserve unrelated exports, keep
the mocked value consistent with the test's actual inputs, restore mutable globals, and prove
same-process full-suite behavior. Run the full suite in more than one relevant order when the runner
or project supports it.

**Anti-pattern**: Registering a narrow top-level built-in mock, relying on `mock.restore()` to
isolate it, or validating only the changed test file.

## <pattern:strict-test-doubles>

**Problem**: Coverage-oriented test repairs use `any`, incomplete filesystem doubles, or mutations
of readonly shared adapters. Focused tests can pass while the project's strict type gate fails.

**Solution**: Build complete dependency shapes, define stubs from the SUT's exported function types,
run the strict type lane after test edits, and use dependency injection or a typed local seam
instead of mutating readonly shared objects. Keep cleanup guaranteed when a shared seam is
temporarily replaced.

**Anti-pattern**: `as any`, suppression comments, partial doubles accepted by the test runner, or a
type check omitted because lint already passed.

---

## <pattern:real-timers-in-tests>

**Problem**: Tests using real `setTimeout`/`setInterval` with long delays (e.g., 1000ms+) cause slow
test suites and potential hangs if timers aren't cleaned up.

**Solution**: Use fake timers that can be advanced programmatically.

```ts
// Fake timer infrastructure
let timerId = 0;
const timers = new Map<number, { callback: () => void; delay: number }>();

const fakeSetTimeout = mock((callback: () => void, delayMs: number): number => {
  const id = ++timerId;
  timers.set(id, { callback, delay: delayMs });
  return id;
});

const fakeClearTimeout = mock((id: number) => {
  timers.delete(id);
});

const advanceTimers = (ms: number) => {
  const expired: number[] = [];
  for (const [id, timer] of timers) {
    if (timer.delay <= ms) expired.push(id);
  }
  for (const id of expired) {
    const timer = timers.get(id);
    if (timer) { timers.delete(id); timer.callback(); }
  }
};

// In test:
globalThis.setTimeout = fakeSetTimeout;
globalThis.clearTimeout = fakeClearTimeout;
advanceTimers(1); // advance 1ms
advanceTimers(1_050); // advance 1050ms more
```

**Anti-pattern**: Using real `setTimeout` in test mocks:
```ts
// BAD - uses real timer
const timers = mock((cb, delay) => setTimeout(cb, delay));
```

---

## <pattern:unmocked-external-boundaries>

**Problem**: Tests that leave external boundaries live (network, filesystem, process spawn, timers,
console, environment) cause flakiness, slow execution, and hangs.

**Solution**: Mock EVERY external boundary using `mock()` and `mock.module()`:

```ts
// Mock modules
mock.module('../utils/filesystem.js', () => ({}));

// Mock functions
const spawn = mock(() => ({
  exited: Promise.resolve(0),
  kill: mock(),
  stderr: null,
  stdout: null,
}));

// Mock globals
const originalEnv = Bun.env;
Bun.env = { ...Bun.env, TEST_VAR: 'value' };
afterEach(() => { Bun.env = originalEnv; });
```

**Anti-pattern**: Using real implementations in unit tests.

---

## <pattern:missing-afterEach-cleanup>

**Problem**: Tests that create resources (timers, streams, event listeners, temp files) without
cleaning them up cause hangs between tests.

**Solution**: Always clean up in `afterEach`:

```ts
afterEach(() => {
  timers.clear();
  timerId = 0;
  fakeSetTimeout.mockClear();
  fakeClearTimeout.mockClear();
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
});
```

**Anti-pattern**: Relying on process exit to clean up.

---

## <pattern:slow-test-anti-patterns>

| Pattern | Fast Alternative |
|---------|------------------|
| Real `setTimeout(1000)` | Fake timer + `advanceTimers(1000)` |
| Real file I/O | Mock filesystem module |
| Real network calls | Mock fetch/http modules |
| Real process spawn | Mock spawner function |
| Real stdin read | Inject mocked `readInput` |
| Real random/UUID | Mock `crypto.randomUUID` |
| Real Date/clock | Mock `Date.now` or use fixed time |

---

## <pattern:test-structure-for-speed>

1. **Separate fast unit tests from slow integration tests** - use different test files or
   directories
2. **Use `test.each` for parameterized tests** - avoids duplicate setup
3. **Mock at module boundary** - use `mock.module()` for all imports except SUT
4. **Inject dependencies** - pass boundaries as parameters, not global imports
5. **Keep timeouts short** - use 1ms for timeout tests, advance fake timers

---

## <pattern:mock-module-rule>

**Rule**: `mock.module()` for EVERY imported module other than the SUT.

```ts
// Correct
mock.module('../../utils/filesystem.js', () => ({}));
const { writeJson } = await import('../../scripts/write-json.js');

// Incorrect - live filesystem
import { nodeFileSystem } from '../../utils/filesystem.js';
```

---

## <pattern:mock-reset-semantics>

**Rule**: `mockReset()` in Bun **clears the implementation to `undefined`** - it does NOT restore
the factory or prior base implementation. After any `mockReset()`, re-apply the base implementation
in the next `beforeEach` (e.g. `fn.mockImplementation(baseImpl)`), otherwise later calls return
`undefined` and downstream code fails with `undefined is not a function`.

Verified empirically on Bun 1.4.2 via BUN_TEST_POC. External references claiming sinon-style
"restore base implementation" behavior do not apply to `bun:test`. Prefer `mockClear()` when you
only need call-history reset.
