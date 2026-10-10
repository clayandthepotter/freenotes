# ADR 0004 · Accounts on Supabase, bring-your-own-key through the server

**Status:** accepted · 2026-10-10

## Context

freenotes started local-first: the workspace lives in the browser and the operator's API key powers the assistant. Two needs appeared: using the app from more than one device, and letting each user pay for and choose their own model provider.

## Decision

- **Supabase** provides authentication (magic-link email) and Postgres. Two tables, both behind row-level security keyed on `auth.uid()`: `workspaces` (one JSON snapshot per user with a `revision` for optimistic concurrency) and `user_settings` (profile, provider, model, base URL, encrypted API key).
- **No service-role key anywhere.** The API verifies the user's JWT with `auth.getUser(token)` and then talks to Postgres as that user with a user-scoped client, so RLS is the only authorisation model. The browser reads and writes its own workspace directly through supabase-js for the same reason.
- **Keys go through the server, not direct from the browser.** The browser sends a key once to `PUT /api/settings`; the API seals it with AES-256-GCM under `FREENOTES_KEY_SECRET` and stores only the ciphertext and the last four characters. Model calls run server-side with the decrypted key. The key never returns to any client.
- **Providers are a registry.** `@freenotes/api` maps a provider id to a `ChiefOfStaff` factory: Anthropic, OpenAI, and any OpenAI-compatible endpoint (Groq, Mistral, OpenRouter, Ollama on a self-hosted server). Both model adapters share `@freenotes/ai-structured` (schemas, prompts, mapping), so adding a provider is one `ask()` method.
- **Local-first stays.** Without a session the app behaves exactly as before; on first sign-in the user is offered a copy of their local workspace into the account.

## Consequences

- An operator can run the app with no accounts at all (three env vars absent) and nothing changes.
- Rotating `FREENOTES_KEY_SECRET` invalidates stored keys; users re-enter them. Acceptable for now, documented.
- Magic links require the Supabase project's Site URL and redirect allow-list to include the deployed origin.
- Direct-from-browser provider calls were rejected: they would bundle provider SDKs into the SPA and several providers block browser origins.
