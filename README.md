# freenotes

**Notes with a chief of staff.** Braindump what you must do, get a time-blocked schedule, step-by-step execution plans, an achievement report with areas to improve, and a reflection question for everything you finished.

Open source (MIT), local-first, TypeScript. Works fully offline with a built-in heuristic assistant; add an Anthropic API key and Claude takes the chief-of-staff seat.

```
braindump ──▶ todos ──▶ time-blocked schedule ──▶ execution plans
                                                          │
       reflection ◀── achievement report ◀── results ◀────┘
```

## The loop

1. **Braindump.** One line per commitment. Optional "by when", effort and priority:
   ```
   - Finish Q4 budget deck by Friday ~2h
   - [high] Call the dentist
   - Write launch post due Oct 20 (1h30m)
   - Book flights !low
   - Review PR #42 by tomorrow 3pm
   ```
   The chief of staff estimates effort and sets priority where you did not. It never overrides what you typed.
2. **Schedule.** Deadline items are placed earliest-deadline-first; undated items are fitted into the remaining gaps by priority. Long items are split into focus blocks with breaks. Deadlines that cannot be met are flagged, not hidden.
3. **Plan.** Each todo is decomposed into execution parameters: objective, the literal first action, ordered steps with estimates, a definition of done, inputs to have at hand, and risks.
4. **Report.** You write a results composition (`T1: done — shipped Thursday`, `T2 partial …`, `T3 blocked on …`). The chief of staff composes an achievement report: achievements ordered by significance, areas to improve grounded in the evidence, and **one reflection question per completed todo**.
5. **Reflect.** Answer the questions; the answers are kept with the report.

Every artefact is a *composition* (a note), so you can read and search the whole history like any other note.

## Quick start

Requires Node 20+ and [pnpm](https://pnpm.io).

```bash
git clone https://github.com/clayandthepotter/freenotes
cd freenotes
pnpm install
pnpm build
```

### CLI

```bash
alias freenotes="node $PWD/apps/cli/dist/bin.js"

printf -- "- Finish the deck by Friday ~2h\n- Call the dentist\n" | freenotes braindump
freenotes schedule --days 7 --hours 09:00-17:00 --workdays mon-fri
freenotes plan all
echo "T1: done — shipped Thursday. T2 partial, left a voicemail" | freenotes report
freenotes reflect T1 "Starting with the hardest slide made the rest easy."
freenotes notes            # list compositions
freenotes show latest
freenotes --help
```

The workspace is a single JSON file at `./.freenotes/workspace.json` (override with `--workspace` or `FREENOTES_WORKSPACE`). Commit it, sync it, grep it.

### Web app

```bash
export ANTHROPIC_API_KEY=sk-ant-…          # optional; without it the heuristic assistant is used
pnpm --filter @freenotes/server start      # API + serves the built web app on http://localhost:8787
```

For development with hot reload run the server as above and, in another terminal, `pnpm --filter @freenotes/web dev` (Vite proxies `/api` to the server).

The web app stores your workspace in the browser (export/import as JSON from Settings). Only chief-of-staff requests leave the device, and they go to *your* server, so the API key never reaches the browser.

### Deploy to Vercel

The web app and its API deploy as one Vercel project: the Vite build is served statically and `apps/web/api` runs the Hono API as a Vercel Function.

1. Import the repository in Vercel and set **Root Directory** to `apps/web` (`apps/web/vercel.json` supplies the build command).
2. Add `ANTHROPIC_API_KEY` in the project's environment variables; without it the deployment serves the heuristic chief of staff.
3. Optional: `FREENOTES_MODEL`, `FREENOTES_EFFORT`, `FREENOTES_FALLBACKS`.

Any Node host works too: `pnpm build && pnpm --filter @freenotes/server start`.

### Using Claude

| Variable | Meaning | Default |
|---|---|---|
| `ANTHROPIC_API_KEY` | Enables the Claude chief of staff (an `ant auth login` profile also works) | – |
| `FREENOTES_AI` | `auto`, `claude` or `heuristic` | `auto` |
| `FREENOTES_MODEL` | Claude model id | `claude-opus-5-5` |
| `FREENOTES_EFFORT` | `low` · `medium` · `high` · `xhigh` · `max` | `high` |
| `FREENOTES_FALLBACKS` | `false` disables server-side refusal fallbacks | `true` |
| `FREENOTES_PROFILE` | A sentence or two about you, sent with every request | – |
| `PORT` | Server port | `8787` |

Requests use structured outputs, so the model's answers are validated against the domain's own rules before they are stored (for example: every completed todo must get exactly one reflection question, phrased as a question).

## Architecture

A pnpm monorepo organised around a domain model; see [`docs/architecture.md`](docs/architecture.md) and the ADRs in [`docs/adr`](docs/adr).

| Package | What it is |
|---|---|
| `@freenotes/core` | The domain and application layer. Zero runtime dependencies; runs in Node and browsers. Parsers, scheduler, use cases, markdown renderers, the `ChiefOfStaff` port, a heuristic implementation, an in-memory repository. |
| `@freenotes/ai-anthropic` | `ChiefOfStaff` implemented with Claude via `@anthropic-ai/sdk` structured outputs. |
| `@freenotes/ai-http` | Wire protocol, `fetch` client and framework-agnostic handlers for putting a chief of staff behind HTTP. |
| `@freenotes/storage-fs` | Atomic JSON-file `WorkspaceRepository`. |
| `freenotes` (`apps/cli`) | The command line. |
| `@freenotes/server` (`apps/server`) | Hono server: chief-of-staff API + static web app. |
| `@freenotes/web` (`apps/web`) | Vite + React app, local-first. |

## Development

```bash
pnpm test          # vitest, all packages (TZ=UTC for deterministic dates)
pnpm typecheck     # strict TypeScript everywhere
pnpm build
pnpm verify        # build + typecheck + test, what GitHub Actions runs
```

Tests come first: the scheduler, parsers and use cases are specified by their tests, and both chief-of-staff implementations must satisfy the same domain validators. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Status

Early. The loop works end to end in the CLI and the web app. Ideas on the table: calendar import for busy blocks, recurring braindumps, multiple workspaces, a mobile layout pass, and a richer notes editor. Issues and PRs welcome.

## License

MIT
