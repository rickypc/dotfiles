# Implementation Guide

## Implementation Pattern Selection

Choose patterns based on the problem domain:

| Pattern | When to Use | Avoid When |
|---------|-------------|------------|
| **Repository** | Abstracting data access, multiple storage backends | Single database, simple CRUD only |
| **Service Layer** | Coordinating business logic across multiple repositories | Logic fits in a single model method |
| **Factory** | Complex object creation, conditional construction logic | Simple constructor suffices |
| **Strategy** | Runtime behavior variation (e.g., payment processing, notifications) | Only one algorithm exists |
| **Observer/Event** | Decoupling side effects from core logic (email, logging, cache invalidation) | Synchronous response required from all handlers |
| **Middleware/Pipeline** | Cross-cutting concerns (auth, logging, validation, rate limiting) | Single-purpose request handling |
| **Adapter** | Wrapping external APIs/SDKs behind a stable internal interface | Internal-only code with no external dependencies |

## Framework-Specific Implementation Strategies

### General Principles (All Frameworks)
1. Scan existing code for conventions before generating new code
2. Match the project's import style (named vs. default, absolute vs. relative)
3. Follow the project's directory structure conventions
4. Use the project's established error handling pattern
5. Match existing naming conventions (camelCase, snake_case, PascalCase)

### Web API Implementation Checklist
For each endpoint, implement or verify:
- [ ] Route definition with HTTP method and path
- [ ] Request validation (path params, query params, body schema)
- [ ] Authentication/authorization middleware
- [ ] Service call with error handling
- [ ] Response serialization with correct status code
- [ ] Error response formatting (consistent error envelope)

### Database Model Checklist
For each entity, implement or verify:
- [ ] Model/schema definition with field types and constraints
- [ ] Indexes for queried fields and foreign keys
- [ ] Timestamps (created_at, updated_at) where appropriate
- [ ] Soft delete support if specified in requirements
- [ ] Migration file for schema changes
- [ ] Seed data for development/testing if applicable

## Existing-codebase Modification Best Practices

When modifying existing codebases (most common scenario):

### Before Writing Code

1. **Map the complete change surface**: Identify every source, test, config,
   reference, example, and pattern that will be touched.
2. **Trace the call chain**: Follow the execution path from entry point to
   persistence or external side effect.
3. **Check for tests**: Find existing tests that cover the area being modified.
   For a TypeScript/Bun test, delegate immediately to `/bun-test-generator`
   before writing or repairing the test.
4. **Identify conventions**: Note the exact naming, declaration-order, import,
   and error-handling conventions used in surrounding code.

### Modification Rules
- Match the surrounding code's style exactly, even if you prefer another style
- Do not refactor unrelated code in the same change
- Preserve existing function signatures when adding optional parameters
- Add backward-compatible defaults for new configuration
- Update existing tests to cover the changed behavior
- Add new tests for new behavior

### Batch implementation and gate procedure

Follow these steps in order:

1. Freeze the approved file and behavior scope.
2. Apply all related source, test, reference, example, and pattern changes in
   one coherent implementation batch.
3. Compare every planned focused test or checker with the configured final
   gate. If the gate includes that work, do not run it separately. Run a
   focused check only when it is outside the gate or needed to diagnose a
   failure; do not run the final gate after each small edit.
4. Run the configured final gate once after the complete batch.
5. If it fails, classify all failures first, repair the complete affected
   boundary, and rerun the same final gate once. Use a targeted diagnostic only
   when it narrows the failure and is not already covered by that gate.
6. Repeat only for a new evidence-backed repair batch. For declaration-order
   failures, apply the full emitted reorder packet before rerunning the gate.

Declaration-order mutation is a guarded operation: inspect all selected files
read-only first, apply at most one emitted packet to one file, verify the
post-fix report and diff, and stop if source content is not preserved. Never
use a broad autofix or whole-directory write to repair declaration order.

The final gate is the repository's one decision boundary. Do not replace it
with a green focused test, and do not create a second gate for a neighboring
change.

Run one final-gate invocation per repair batch. Distinct bounded lanes inside
that one gate may run concurrently: one Biome process, one TypeScript process,
one Tree-sitter declaration-order pass, and one unit-test process are separate
work. Never launch multiple instances of the same checker, multiple checker
wrappers, or multiple final-gate invocations in parallel. Start them from the
selected project's `<agents-root>` directory with paths inside that root;
invoking a checker from the user's home can make Biome scan unrelated
protected directories.

### Common Pitfalls
- Breaking existing imports by renaming or moving files
- Changing a function's return type without updating all callers
- Adding required parameters to public APIs
- Modifying shared utility functions without checking all consumers
- Forgetting to update database migrations for schema changes

## Testing Patterns

### Unit Test Structure
Follow the Arrange-Act-Assert (AAA) pattern:
```
// Arrange: Set up preconditions and inputs
// Act: Execute the unit under test
// Assert: Verify the expected outcome
```

### What to Test per Unit

| Unit Type | Test Focus |
|-----------|------------|
| Service/Use Case | Business logic correctness, edge cases, error handling |
| Controller/Handler | Request parsing, response format, status codes, auth checks |
| Repository/DAO | Query correctness (use in-memory DB or test containers) |
| Utility/Helper | Input/output mapping, boundary values, null/undefined handling |
| Middleware | Pass-through behavior, rejection conditions, header manipulation |

### Test Data Strategy
- Use factories/builders for complex objects (avoid raw JSON literals)
- Isolate test data per test (no shared mutable fixtures)
- Use meaningful test data that reflects real scenarios
- Name test variables to express their purpose (`expiredToken`, `adminUser`, `emptyCart`)

## Code Quality Standards

### Function Design
- Maximum 30 lines per function (excluding tests)
- Single responsibility: one function does one thing
- Maximum 3 parameters; use an options object for more
- Return early to avoid deep nesting (guard clauses)
- Pure functions where possible (no side effects)

### Error Handling
- Fail fast: validate inputs at function entry
- Use typed/custom errors for domain-specific failures
- Never swallow exceptions silently (at minimum, log them)
- Propagate errors with context (wrap, do not replace)
- Distinguish between recoverable errors (retry) and fatal errors (abort)

### Naming Conventions
- Functions: verb + noun (`createUser`, `validateInput`, `calculateTotal`)
- Booleans: `is`/`has`/`should` prefix (`isActive`, `hasPermission`)
- Collections: plural nouns (`users`, `orderItems`)
- Constants: UPPER_SNAKE_CASE for true constants
- Avoid abbreviations unless universally understood (`id`, `url`, `api`)

### File Organization
- One primary export per file (class, function, or component)
- Group related files by feature/domain, not by technical layer
- Keep test files adjacent to source files (or in a mirrored `__tests__` directory)
- Index files only for public API re-exports, never for internal organization

## Automation-Friendly Code Rules

### data-testid Attributes
Add `data-testid` attributes to all interactive elements to support automated testing (E2E, integration, accessibility audits):

- **Required on**: buttons, inputs, links, form elements, modals, dropdowns, tabs, and other interactive containers
- **Naming convention**: `{component}-{element-role}` (e.g., `login-form-submit-button`, `user-profile-edit-link`, `settings-modal-close`)
- **Rules**:
  - Use lowercase kebab-case
  - Keep `data-testid` values stable across code changes — do not tie them to dynamic state or auto-generated IDs
  - Avoid dynamic or auto-generated IDs (e.g., `button-${index}`) — use semantic names instead
  - Group related elements under a container `data-testid` (e.g., `user-table` wrapping `user-table-row-{id}`)
  - Apply to both visible and programmatically interactive elements (e.g., hidden file inputs triggered by a button)

## Required change-batch protocol

Before editing, inventory all affected code, tests, instructions, examples, and references with `/codebase-memory`; retrieve durable context and prior lessons with `/knowledge-base`. Make the complete approved change set first, including all mechanically related references. For TypeScript/Bun tests, hand off to `/bun-test-generator` immediately before writing or repairing tests, then retain its boundary evidence.

Run the configured final gate once after the complete batch. Do not run focused checks that the final gate already covers, and do not run the gate after each small edit. If it fails, fix every compatible failure from that receipt in one repair batch, then rerun the final gate once. Never run the same checker or final gate concurrently; distinct bounded read-only checks may run in parallel. Preserve existing code and make the smallest safe change; stop before an edit when the required contract is not known.
