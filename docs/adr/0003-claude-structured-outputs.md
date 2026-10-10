# ADR 0003 · Claude via structured outputs, server-side in the web app

**Status:** accepted · 2026-10-10

## Context

Each chief-of-staff task has a fixed shape. Free-text answers would need brittle parsing. The web app must not expose an API key.

## Decision

- `@freenotes/ai-anthropic` calls `client.beta.messages.parse` with a zod-derived `output_config.format`, model `claude-opus-5-5`, `effort: "high"`, adaptive thinking (the model default), a cached system prompt, and `fallbacks: "default"` so a safety refusal is retried server-side on a suitable model. Refusals and truncated answers surface as `ChiefOfStaffError`.
- The browser never holds a key. `@freenotes/ai-http` defines the wire protocol; `apps/server` mounts it; the web app's `HttpChiefOfStaff` talks to it and falls back to the heuristic assistant when no server answers.

## Consequences

- One request per task, no agent loop, predictable cost.
- The protocol has its own codec tests, so changing the domain types without updating the wire format fails CI.
- Fallbacks can be disabled (`FREENOTES_FALLBACKS=false`) for platforms that reject the parameter.
