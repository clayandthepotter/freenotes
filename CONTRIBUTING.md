# Contributing to freenotes

Thanks for helping. A few conventions keep the codebase coherent.

## Principles

- **Domain first.** New behaviour starts in `packages/core` as types and pure functions with tests. Transport, storage and UI come after and stay thin.
- **Tests before code.** Write the failing test, make it pass, then tidy. `pnpm test` must be green and `pnpm typecheck` clean (strict mode, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`).
- **Deterministic by default.** Parsers and the scheduler are pure: same input, same output. Anything that calls a model goes behind the `ChiefOfStaff` port and must pass the same domain validators as the heuristic implementation.
- **Never override the executive.** Estimates, deadlines and priorities the user typed are facts. Assistants fill gaps; they do not edit facts.
- **Nothing silently dropped.** Lines that do not parse are returned as `ignoredLines` / `unmatchedLines` and shown to the user.

## Layout

```
packages/core/src
  shared/        Result, Clock, ids, LocalDate/LocalTime, TimeRange
  composition/   Composition (a note)
  planning/      Todo, Deadline, braindump + date parsers, WorkingHours, Schedule, scheduler
  execution/     ExecutionPlan
  review/        TodoResult parser, AchievementReport, reflections
  workspace/     Workspace aggregate + JSON codec
  ports/         ChiefOfStaff, WorkspaceRepository
  application/   use cases + the Freenotes facade
  render/        markdown renderers
  adapters/      heuristic chief of staff, in-memory repository
```

The ubiquitous language is in `docs/architecture.md`. Use those words in code, tests and UI copy.

## Workflow

1. Fork, branch from `main`.
2. `pnpm install && pnpm verify`.
3. Add or change tests alongside the code (`*.test.ts` next to the module).
4. Keep PRs focused. If you change the wire protocol (`@freenotes/ai-http`), say so in the PR.
5. Open the PR; CI runs typecheck, tests and build on Node 20 and 22.

## Running the model-backed assistant locally

```bash
export ANTHROPIC_API_KEY=…
pnpm build
FREENOTES_AI=claude node apps/cli/dist/bin.js braindump --text="- Call the dentist"
```

Model calls are not exercised in CI; the `@freenotes/ai-anthropic` tests use a fake client and check request shape, mapping and error handling.

## Code of conduct

Be kind, assume good intent, keep feedback specific. Maintainers may remove contributions or contributors that do not.
