# Common software-engineering profile

Apply this profile with an observed language/framework profile. It is a
home-owned planning, implementation, and review standard; project instructions,
security policy, and the configured final gate take precedence.

## Design and code shape

- Prefer the smallest solution that solves the verified requirement. Do not add
  a framework, repository, service layer, cache, queue, feature flag, or shared
  abstraction until a concrete consumer, variability, or boundary requires it.
- Keep responsibilities cohesive and dependencies directional. Split a unit
  when it has multiple independent reasons to change, not merely because a
  numeric line count was crossed.
- Prefer clear names, explicit data flow, early exits, named domain constants,
  and narrow public contracts. Explain an unavoidable surprising choice at its
  owning boundary.
- Avoid hidden mutation across boundaries. When mutation is idiomatic or needed
  for performance, make ownership, lifetime, and side effects explicit and
  test the observable consequence.
- Handle errors where recovery or translation belongs. Do not swallow failures,
  leak internal/sensitive detail to users, or turn an expected failure into an
  unobservable null/empty result.

## Trust, data, and security boundaries

- Validate untrusted data at ingress: user input, files, queue payloads,
  environment/config values, third-party responses, URLs, and stored data when
  it re-enters a trusted boundary.
- Use typed/schema validation where the project has it; reject/normalize invalid
  values before business logic. Authorization is independent from validation
  and must be checked for the affected resource/action.
- Keep credentials, tokens, private identifiers, and sensitive payloads out of
  source, tests, logs, browser bundles, errors, and copied diagnostics. Rotate
  a suspected exposed secret through the appropriate owner.
- Use parameterized/bound data access, safe path construction, output encoding
  or sanitization at HTML/DOM boundaries, and explicit controls for cross-site,
  cross-origin, upload, and external-call behavior when relevant.

## Testing and proof

- Test behavior and contracts at the smallest useful boundary. Use unit proof
  for branching/domain logic, integration proof for persistence/protocols, and
  end-to-end/browser proof for a critical user path only where the project owns
  that surface.
- Arrange setup, perform the action, then assert the observable result. Names
  should say the condition and expected behavior, including invalid/empty/error
  cases where material.
- Preserve isolation: fixtures/mocks model real boundaries and do not merely
  make a desired assertion pass. Correct implementation or the requirement;
  do not weaken a test solely to obtain green output.
- Do not impose a global coverage number or test runner. Map risk to proof,
  record intentional manual proof, and still run the project-owned final gate.

## Review and performance

- Review changed behavior, consumers, public contracts, error paths,
  authorization, data validation, resource lifetime, concurrency, and test
  evidence before cosmetic concerns. A clean review must name its scope.
- A performance claim needs a named path, measurement/observation, baseline or
  expected limit, and trade-off. Guard against unbounded reads, N+1 access,
  needless repeated work, uncontrolled allocations, blocking I/O, and missing
  cancellation/pagination according to the selected platform.
- Treat a performance/security/reliability concern as a re-plan trigger when
  the fix changes scope, architecture, or proof strategy. Do not smuggle it
  into a small patch without recording the impact.
