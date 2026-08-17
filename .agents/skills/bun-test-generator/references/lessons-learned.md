# Lessons Learned: Avoiding Hanging/Slow Tests

## <pattern:hanging-stdin>

**Problem**: Tests that read from `stdin` (e.g., `Bun.stdin`, `process.stdin`, `new Response(Bun.stdin).text()`) hang indefinitely in test environments because no input is provided.

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

---

## <pattern:real-timers-in-tests>

**Problem**: Tests using real `setTimeout`/`setInterval` with long delays (e.g., 1000ms+) cause slow test suites and potential hangs if timers aren't cleaned up.

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

**Problem**: Tests that leave external boundaries live (network, filesystem, process spawn, timers, console, environment) cause flakiness, slow execution, and hangs.

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

**Problem**: Tests that create resources (timers, streams, event listeners, temp files) without cleaning them up cause hangs between tests.

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

1. **Separate fast unit tests from slow integration tests** - use different test files or directories
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
