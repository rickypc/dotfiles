# Collaborative programming guide

Collaborative programming is a team practice in which several people work on
the same change at the same time. It is useful when shared understanding,
design quality, or risk reduction matters more than individual throughput.

## Participation model

- **Driver**: operates the editor and translates the agreed direction into
  code. The driver asks for clarification instead of silently changing the
  design.
- **Navigators**: reason about the approach, edge cases, contracts, and tests.
  One navigator speaks at a time so the driver receives a usable signal.
- **Facilitator**: keeps the session focused, manages rotation, records parked
  questions, and makes space for quieter participants.

## Working pattern

1. Agree on one observable outcome for the session.
2. Read the relevant requirements, code, tests, and constraints together.
3. Set a short driver rotation, normally 10–15 minutes.
4. Keep a visible decision and follow-up list.
5. Review or run focused validation after each meaningful increment only when
   it is outside the configured final gate; do not execute a covered check
   before the gate.
6. End by recording what changed, what remains, and the next owner.

## When to collaborate

| Situation | Recommended approach |
| --- | --- |
| Onboarding or unfamiliar domain | Collaborative programming |
| High-risk design or contract change | Collaborative programming |
| Several specialties must agree | Collaborative programming |
| Repetitive, well-understood work | Solo or pair work |
| Deep individual research | Solo work, then share findings |
| Small, local defect | Pair or solo work |

Use collaboration when it reduces uncertainty or knowledge silos. Stop when
the coordination cost exceeds the remaining risk.

## Remote tooling

Use a shared editor or screen-sharing session, a reliable voice channel, and a
shared Markdown note for decisions. Avoid introducing a handoff tool merely to
coordinate a short session; normal version-control practices are sufficient.

## Facilitation safeguards

- Keep the goal and current decision visible.
- Park unrelated questions instead of expanding scope.
- Take regular breaks during long sessions.
- Rotate participation so the practice transfers knowledge rather than
  concentrating it in one person.
- If the group is stuck, pause for a short individual investigation and then
  reconvene with evidence.

## Closeout

Review the changed behavior, focused checks, open risks, and follow-up items.
Commit or hand off through the repository's normal process. Record a durable
lesson only when the observation is specific, verified, and likely to help a
future change.
