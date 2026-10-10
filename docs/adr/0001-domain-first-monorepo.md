# ADR 0001 · Domain-first monorepo with a dependency-free core

**Status:** accepted · 2026-10-10

## Context

freenotes needs to run as a CLI, a web app and a server, and the AI assistant must be swappable (Claude, offline heuristics, future providers). The project follows DDD and TDD.

## Decision

- A pnpm workspace. `@freenotes/core` holds the domain and application layers with **zero runtime dependencies**, so it runs unchanged in Node and browsers and is cheap to test.
- Everything that touches the outside world is an adapter package or an app: `ai-anthropic`, `ai-http`, `storage-fs`, `apps/*`.
- Use cases are pure functions over an immutable `Workspace`; a thin `Freenotes` facade adds persistence.

## Consequences

- The whole loop is covered by fast unit tests with an in-memory repository and the heuristic assistant.
- Adding a provider means implementing one interface and passing two validators.
- Apps carry very little logic; UI bugs and domain bugs are easy to tell apart.
