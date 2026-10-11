# Architecture

freenotes is built domain-first. The domain model is a plain TypeScript library with no runtime dependencies; everything else (Claude, files, browsers, HTTP) is an adapter around it.

## Ubiquitous language

| Term | Meaning |
|---|---|
| **Composition** | A note. Every artefact of the loop is a composition of a given *kind*: `braindump`, `schedule`, `execution-plan`, `results`, `achievement-report`, or a plain `note`. |
| **Braindump** | A composition the executive writes: one commitment per line, with optional deadline ("by Friday"), effort ("~2h") and priority ("[high]", "!low"). |
| **Todo** | A commitment extracted from a braindump. Has a stable code (`T1`), title, priority, estimated minutes with an *estimate source* (`explicit` / `default` / `assistant`), and an optional **Deadline**. |
| **Deadline** | A calendar date plus optional wall-clock time. A date-only deadline means "end of that working day". |
| **Working hours** | Per-weekday windows in which the executive accepts time blocks. |
| **Schedule** | A set of **time blocks** (todo × time range × part n/m) over a horizon, plus **warnings** (`deadline-at-risk`, `deadline-passed`) and **unscheduled** remainders. |
| **Execution plan** | Step-by-step execution parameters for one todo: objective, first action, ordered steps, definition of done, inputs, risks. |
| **Step progress** | What the executive did with one plan step: ticked or not, plus whatever they wrote while doing it. Steps that ask for text are answered inline; the notes travel into the results composition. |
| **Todo result** | What the executive reports for a todo: `done`, `partial`, `blocked`, `skipped` plus notes. |
| **Achievement report** | The chief of staff's debrief: headline, achievements ordered by significance, improvements with evidence, one **reflection** question per completed todo. |
| **Chief of staff** | The assistant role (a port). Implementations: Claude, heuristic. |
| **Profile** | Who the executive is: name, working style (from the eight-question quiz), goals the work should serve, boundaries the assistant must respect. Described to the chief of staff with every request. |
| **Connected calendar** | A calendar the executive linked, today an ICS feed. Its **calendar events** are read, never owned: they appear on the brief and count as busy time for the scheduler. |
| **Workspace** | Everything one executive has: compositions, todos, schedule, plans, results, report, reflection answers, settings. |

## Bounded contexts (inside `@freenotes/core`)

- **planning** — capture and scheduling. Owns `Todo`, the braindump and date-expression parsers, `WorkingHours`, `Schedule` and the scheduler.
- **execution** — `ExecutionPlan` and its invariants, and `StepProgress` (ticks and inline notes per step).
- **review** — results parsing, `AchievementReport`, reflections and their invariants.
- **profile** — the working-style quiz and its scoring, the `Profile` aggregate and its description for the assistant.
- **calendar** — connected calendars, the iCalendar reader (recurrence, time zones, overrides), busy-time derivation.
- **composition** — notes as the user sees them.
- **workspace** — the aggregate that ties the above together and its JSON codec.

Contexts talk through plain types (`TodoId`), never through each other's internals.

## Layers

```
apps/cli · apps/web · apps/server             UI / transport
         │
@freenotes/core application/                  use cases + Freenotes facade
         │
@freenotes/core domain (planning, execution,  pure functions, value objects, invariants
                        review, composition, workspace)
         │
ports: ChiefOfStaff, WorkspaceRepository,      interfaces the domain needs
       CalendarFeedFetcher
         ▲
adapters: ai-anthropic, ai-http, storage-fs,   implementations
          heuristic, memory, localStorage
```

Use cases are pure: `(workspace, input, deps) → { workspace', output }`. The `Freenotes` facade adds load/save around them. This keeps the whole loop testable without I/O (see `application/freenotes.test.ts`).

## Scheduling

`buildSchedule` is deterministic:

1. Free time = working-hour windows in `[from, from + horizon)` minus busy ranges.
2. Dated todos, sorted by deadline instant, then priority, then braindump order, are allocated greedily into the earliest free time (EDF). A todo that cannot finish before its deadline is still placed and flagged `deadline-at-risk`; an executive wants to see the problem, not have it hidden.
3. Undated todos, sorted by priority then braindump order, fill the remaining gaps.
4. Allocation splits work into blocks of at most `maxBlockMinutes` on `granularityMinutes` boundaries, with `breakMinutes` after each block. Slivers shorter than the granularity are dropped.

## The chief-of-staff port

```ts
interface ChiefOfStaff {
  refineTodos(request): Promise<TodoRefinement[]>;        // estimates, priority, clarified titles
  planExecution(request): Promise<ExecutionPlan>;          // decomposition
  composeAchievementReport(request): Promise<AchievementReport>;
}
```

Both implementations must produce output that passes `validateExecutionPlan` and `validateAchievementReport`. The Claude adapter uses structured outputs (JSON schema derived from zod) and additionally repairs two things the schema cannot express: a missing reflection question for a completed todo, and a question without a question mark. Explicit user estimates are never replaced, regardless of what the model says (`applyRefinements`).

## Accounts

Optional, provided by Supabase (see ADR 0004). `@freenotes/api` defines two more ports, `Authenticator` and `UserSettingsRepository`, and resolves a `ChiefOfStaff` per request: a signed-in user's provider and decrypted key when configured, otherwise the operator default. `@freenotes/supabase` implements the ports plus a `WorkspaceRepository` that stores the JSON snapshot with a revision for optimistic concurrency. Authorisation is row-level security only; no service-role key exists in the system.

## Calendars

`parseIcs` is a dependency-free iCalendar reader for what Google, Outlook and iCloud publish: folded lines, DATE and DATE-TIME values (UTC, floating, `TZID` including common Windows zone names, resolved through `Intl`), `DURATION`, `RRULE` with `FREQ`/`INTERVAL`/`COUNT`/`UNTIL`/`BYDAY`, `EXDATE`, `RECURRENCE-ID` overrides, `STATUS`, `TRANSP`. Recurrences are expanded only inside the window the workspace keeps (yesterday to the scheduling horizon plus a week); unbounded rules are fast-forwarded to the window rather than walked from their start. Browsers cannot fetch other origins, so `@freenotes/api` exposes `/api/ics`, a proxy that only accepts public https hosts; the CLI fetches directly. `busyRanges` turns timed, opaque, non-cancelled events into merged busy time that `scheduleWorkspace` subtracts from the working hours.

## Persistence

The workspace is small, so repositories load and save it whole. `serializeWorkspace` / `deserializeWorkspace` define the JSON shape (`version: 1`). Implementations: in-memory (tests), JSON file (CLI), `localStorage` (web). Migration hooks belong in the codec when `version: 2` arrives.

## Time

Dates are handled as `LocalDate` / `LocalTime` value objects and converted to instants in the process's local time zone, which is the executive's time zone in both the CLI and the browser. Tests run with `TZ=UTC` so expectations are stable.
