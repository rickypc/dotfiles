# Detailed language and web profiles

Select one or more sections only from observed repository evidence and read
`common.md` first. These profiles are retained local guidance: no section needs
a fixed toolchain, a hook, or a numeric coverage target.

## C#

- Keep nullable intent, async cancellation, and exception boundaries explicit.
  Pass cancellation through I/O paths, avoid sync-over-async, and dispose
  streams/clients/transactions according to the project lifetime model.
- Preserve existing controller/handler, service/use-case, repository, options,
  and dependency-injection seams. Validate request models, translate domain
  failures at the public boundary, and keep transport types separate from
  persistence entities when the project already distinguishes them.
- Review authorization, model binding, serialization, query parameterization,
  EF/query lifetime, and concurrent updates. Test success, validation, missing
  resource, authorization, cancellation, and persistence/contract behavior at
  the appropriate existing test layer.

## Go

- Treat errors as part of the contract: return contextual errors, check them at
  the owning boundary, and avoid panics for ordinary malformed/external input.
  Pass `context.Context` from request to I/O and honor cancellation/deadlines.
- Keep interfaces small and consumer-owned; use explicit dependencies and
  constructors/options where they clarify configuration. Do not add a generic
  repository abstraction around a single concrete data path without a reason.
- Review goroutine ownership, channel closure, data races, resource cleanup,
  timeouts, and zero-value behavior. Match package test conventions and use
  table-driven cases where they clarify behavior; add race/concurrency proof
  when the changed path introduces shared state.

## Java

- Make nullability, optionality, exception translation, transaction boundaries,
  and resource lifecycle clear. Do not use streams, `Optional`, or checked/
  unchecked exceptions merely for style when they hide control flow.
- Respect established Spring/Jakarta/module boundaries: thin controllers,
  explicit service/domain logic, repositories for data access, DTO/schema
  translation at API boundaries, and constructor injection where the project
  uses it. Keep serialization and validation contracts compatible.
- Review authorization annotations/filters, query binding, transaction scope,
  retries/idempotency, and entity-loading side effects. Use existing unit,
  integration, and contract testing patterns to prove validation, persistence,
  response, and failure behavior.

## PHP

- Follow the project’s typing and error model; avoid implicit coercion at a
  request/domain boundary. Validate input, encode rendered output, keep secret
  configuration external, and expose safe public errors.
- Keep controllers/actions focused on transport work. Put business rules in
  explicit services/actions and data access behind established model/query
  boundaries. Use bound parameters and validated identifiers rather than query,
  command, path, or template string concatenation.
- Review authorization/policy checks, tenant/resource scope, serialization,
  file uploads, queues, and database transaction/error paths. Test the changed
  behavior using existing PHPUnit/framework conventions, including invalid and
  forbidden requests.

## Python

- Preserve the project’s type, mutability, exception, and async conventions.
  Avoid mutable defaults; make ownership/lifetime of files, connections, and
  contexts explicit; do not block an async request path with synchronous I/O.
- Keep schemas, endpoint handlers, service/domain work, and persistence
  boundaries distinct when the framework provides them. For FastAPI, validate
  request/response models and dependency-based authorization; for Django,
  preserve model/query/form/serializer boundaries and avoid implicit queryset
  evaluation on unbounded paths.
- Review deserialization, template/output safety, subprocess/filesystem use,
  task retries, timezone/serialization behavior, and exception-to-response
  handling. Use existing fixtures and test styles for success, validation,
  permission, error, async, and persistence cases.

## React Native

- Treat navigation, permissions, app lifecycle, network loss, local state,
  device resources, and platform divergence as product behavior when touched.
  Keep state ownership narrow and document iOS/Android differences explicitly.
- Render accessible labels/roles, meaningful focus and reading order, visible
  loading/empty/error states, adequate touch targets, and no interaction that
  depends solely on color or gesture. Preserve platform accessibility APIs.
- Review list virtualization, image/media memory, repeated renders, bridge/
  native-module lifetime, secure storage, deep links, and release configuration.
  Prove changed user paths with the project’s component/device/e2e tooling.

## React

- Keep state with the narrowest owner and derive rather than duplicate it. Use
  composition before global state; preserve the project’s server/client,
  routing, data-fetching, cache, suspense, and error-boundary conventions.
- Every changed interaction defines loading, empty, error, retry, keyboard,
  focus, semantic, and responsive behavior. Use stable keys and avoid effects
  that duplicate render-derived work or retain stale subscriptions.
- Review untrusted HTML/URLs, browser storage, auth/permission presentation,
  optimistic updates, concurrent requests, and accessibility semantics. Test
  user-visible outcomes with existing component/integration/browser patterns,
  not component internals alone.

## Rust

- Model ownership, borrowing, error variants, and invariants directly. Avoid
  `unwrap`/`expect` on recoverable production paths; return context-rich errors
  and rely on RAII for cleanup.
- Keep `unsafe` isolated, justified, and minimally scoped. In async work,
  avoid blocking executors, propagate cancellation where supported, and review
  `Send`/`Sync`, locking, shared mutation, and task lifetime explicitly.
- Preserve crate/module visibility and trait boundaries. Test error variants,
  parsing/serialization, boundary conditions, and concurrent behavior when the
  changed code owns those risks; use integration tests for public crate APIs.

## TypeScript

- Separate compile-time assumptions from runtime validation. Use precise public
  types, validate untrusted JSON/input, model absence/errors intentionally, and
  avoid `any`, unsafe casts, or type widening merely to silence a checker.
- Preserve module boundaries, async rejection handling, resource cleanup, and
  configuration contracts. Prefer discriminated unions or explicit result/error
  forms when callers must handle variants.
- Review serialization, prototype/shape assumptions, URL/DOM/process boundary
  values, package/configuration impact, and compatibility of exported types.
  Test runtime behavior as well as type-sensitive edge cases at the project’s
  established unit/integration/browser boundary.

## Web

- Start with semantic HTML and progressive interaction. Changed experiences
  define keyboard operation, focus visibility/order, labels, validation errors,
  loading/empty/error/retry states, responsive layout, and reduced-motion
  behavior where animation is material.
- Treat browser data as untrusted at every sink: validate URLs, encode/sanitize
  HTML, avoid unsafe DOM injection, scope storage/token use, and reason about
  CSP, CORS, cookies, CSRF, uploads, permissions, and third-party scripts.
- Measure a named user path before claiming performance improvement. Review
  asset size/loading, render blocking, layout/reflow work, caching, pagination,
  image/font strategy, and network failure behavior. Prove UI changes through
  the existing browser/accessibility test capability when present.
