# Product direction: the chief of staff you never leave

**Status:** draft, 2026-10-10. Being refined against competitor reference material as it arrives.

## Thesis

freenotes becomes the one place an executive looks. Everything that competes for attention, from every account, work and life, lands in one brief and one unified inbox, and the app keeps the person on track through the day. Open source, bring your own model, privacy by design.

## What we take from the reference (batch 1)

- **Onboarding in three steps**, with a progress bar: meet the product, try it right now (type one thing, watch it get structured on the spot, add it to the day), plug in your day (grant calendar, notifications, usage stats, each with a one-line reason). Account creation comes last, after value is shown.
- **An AI disclosure sheet** before the assistant acts: what it can do, that it can be wrong, where data goes, with an explicit "I understand" checkbox and a "Turn it off" escape hatch.
- **Five tabs:** Brief, Actions, Calendar, People, Settings. A floating voice capture button on every tab.
- **Brief** opens with a week strip and a "Get ready" setup card listing missing integrations, then date, greeting, a load badge (light / normal / heavy), a one-line read on the day, "what matters right now", and the timeline.
- **Actions** is the hand-off surface: things waiting on you, things you handed off, quick templates grouped by domain, a "Log decision" affordance, an "All clear" state.
- **Calendar** with Events / 3-day / Month / Insights views, import, block, share, and focus blocks drawn into the free time.
- **People** as relationship intelligence: contacts derived from recurring 1:1s and small meetings, last touch, "never let a contact go cold".

## What we take from the reference (batch 2: settings and personalization)

- **Settings grouped by concern**, each a card with a coloured icon and a one-line summary: You (profile, memory, goals), Intelligence (engine, autopilot), Communications (email, meetings, integrations), Calendar & Time (calendars, availability, notifications), Privacy & Data (security, sync, backup, permissions), Knowledge (memory, documents), Devices. A search field on top.
- **Suggestions from the assistant** at the top of the profile screen, each with a reason and Connect / Schedule / Add plus Dismiss: connect Gmail, morning brief at a time it learns, add your name.
- **A working-style quiz**: eight single-choice questions (first thought on waking, instinct on a new ask, ideal task list, recovery from overwhelm, how a productive week is measured, biggest challenge, behaviour in meetings, dream planning ritual). Each answer column maps to one school: urgent/important triage, inbox-and-next-actions capture, measure-and-adjust cycles, values-and-roles alignment. The result names a style ("Balanced Hybrid") and says how the app adapts: task views and the brief are restructured to match.
- **Memory the user can see and teach**: facts learnt from conversations (decisions, preferences, client context), listed, editable, plus "teach it something".
- **Strategic goals as a gatekeeper**: core objectives that filter low-value meetings, and explicit anti-goals / boundaries, the assistant's rejection criteria.
- **Clients and projects** as tags on events and expenses, so the brief is filtered and attributed automatically.
- **Native OAuth hand-off** for Google with the platform's consent sheet. One tap, nothing to configure.

### How this lands in freenotes

- **Working style** becomes a value object in a new `profile` context: four weighted dimensions (triage, capture, improve, align) derived deterministically from the eight answers, with a named style. The attention scoring, the brief layout and the default task view read it. The quiz is pure domain code with tests; the UI is a sheet.
- **Goals and boundaries** join the same context and are passed to the chief of staff with every request, so execution plans and achievement reports are judged against them. They also feed the attention scoring as an explicit "does this serve a goal" signal.
- **Memory** is a list of facts with provenance (taught by the user, or proposed by the assistant and accepted), stored in the workspace. The assistant proposes, the user confirms; nothing is remembered silently.
- **Suggestions** are produced by the attention context from missing setup (no calendar connected, no name, no brief time) and ranked with everything else.
- **Settings** adopt the grouped-card structure. The provider and key screen we already have becomes the Intelligence group.

## Principles

1. **Never leave the app.** Reading, replying, scheduling, delegating and logging happen inside freenotes. External tools are sources and sinks, not destinations.
2. **Unified, multi-account.** Several calendars and several mailboxes at once, work and personal, in one timeline and one inbox, tagged by account.
3. **Deterministic first, model second.** Parsing, scheduling and triage rules stay deterministic (ADR 0002); the model summarises, drafts, prioritises and reflects.
4. **Local-first, synced when signed in.** Nothing requires an account. Connected sources require one because tokens live server-side.
5. **One attention model.** Every surface (brief, actions, inbox, people) ranks items through the same scoring so the user sees one consistent "what matters".

## Bounded contexts to add to `@freenotes/core`

| Context | Owns | Key invariants |
|---|---|---|
| **integrations** | `ConnectedAccount` (provider, kind, scopes, label), the source ports `CalendarSource`, `MailSource`, `IssueSource`, sync cursors | Many accounts per kind. A source never mutates another context's aggregate directly; it emits normalised items. |
| **calendar** | `CalendarEvent` (account, external id, time range, attendees, busy/free), `BusySet` derived for the scheduler | Focus blocks written back are owned by freenotes and carry a marker so re-sync does not duplicate them. |
| **inbox** | `InboxItem` (kind: mail thread, invite, issue, mention, commitment; account; state: new, needs reply, waiting on, snoozed, done), triage rules, snooze | A commitment found in mail becomes a Todo via the planning context, with a back-reference. |
| **people** | `Person` (identities across accounts, cadence, last touch), relationship signals from events and threads | Derived from recurring 1:1s and small meetings only; large events never create people. |
| **attention** | The scoring that feeds the brief, the "what matters right now" sheet, badges and notifications | Pure function over the workspace; one implementation, tested. |

The existing planning, execution, review and composition contexts stay. Today's `Capture` becomes the plus button inside Actions, and the Plan and Review screens fold into Actions and the Brief.

## Ports and adapters

- `CalendarSource`, `MailSource`, `IssueSource` are ports in core. Adapters: Google (Calendar, Gmail), Microsoft Graph (Outlook calendar and mail), CalDAV/IMAP for everything else, Linear for issues. Each adapter is its own package (`@freenotes/source-google`, `@freenotes/source-linear`, ...).
- OAuth and token storage live in `@freenotes/api`, sealed with the existing `SecretBox`, one row per connected account under RLS. The browser never sees a token.
- Sync runs as scheduled server jobs with incremental cursors (Google sync tokens, Graph delta links, Linear `updatedAt` filters), writing normalised items into Supabase. The web app reads the normalised tables, so it stays fast and offline-tolerant.
- Write-backs (focus blocks, replies, issue updates) go through command endpoints that validate against the domain first.

## Delivery order

1. **Attention and onboarding.** The attention context and the three-step onboarding with the AI disclosure sheet. No integrations yet, but the "Get ready" card already lists them.
2. **Calendar.** Google and Microsoft calendars, multi-account, busy ranges into the scheduler, focus blocks written back. Calendar tab with 3-day and month views.
3. **Inbox.** Gmail and Outlook threads as inbox items, triage states, commitment extraction into todos, drafted replies by the chief of staff.
4. **People.** Derived contacts, cadence, "going cold" surfaced in the brief.
5. **Issues.** Linear as a source and a sink.
6. **Voice capture** on every tab.

Each step ships behind the existing verify pipeline with tests at the domain layer first.

## Operator setup the integrations will need

OAuth clients registered by whoever hosts the app: a Google Cloud project with Calendar and Gmail scopes, a Microsoft Entra app registration, a Linear OAuth application. Client ids and secrets go in server environment variables; the README will document each.
