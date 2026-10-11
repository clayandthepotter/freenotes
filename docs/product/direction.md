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

## What we take from the reference (batch 3: intelligence and autopilot)

- **Two engines, explained in one sentence.** A reasoning engine (cloud or on-device) runs delegations, drafts and summaries; a private-data model runs on-device only and anonymises sensitive content before the cloud ever sees it, then decodes the response back. Provider chips: Auto, On-device, Claude, OpenAI, with a quick-start card per provider (key, model picker, "Save & use").
- **Device-aware model catalogue.** Each on-device model lists download size, RAM, context, and an honest red box when the device cannot run it, with the arithmetic shown.
- **Voice** as a separate choice with previews: best available, cloud TTS, on-device pack, system voice.
- **Autopilot policies.** Named automations, each with an Off / Ask / Auto segmented control, a plain-language description of exactly when it fires and what it will not do, and a trust line: "execute with approval, will move to Auto once trust is at least 75%". Examples: auto-archive newsletters, receipts and calendar notices; auto-reply to a bare thanks; chase stale commitments (nudges only, at most once every two days); weekly update draft on Friday at 4pm; morning-of commitment reminder; autonomously move meetings when the proposed time is unambiguous, at least 12 hours out, conflict-free and 1:1, with the apology reply still waiting for a tap.
- **Autopilot activity**: every action taken, with undo. **Prediction accuracy**: the assistant grades its own wagers once meetings, decisions and deadlines close.
- **Knowledge**: search across facts, documents and a graph of people, projects, meetings and commitments; memory the user can forget; uploaded reference documents; an Obsidian vault hand-off.
- **Scheduled jobs** run while the phone sleeps through a relay (hosted or a custom self-hosted URL), with identifiers replaced by placeholders before upload and anything that acts on the world coming back as a draft for approval.
- **Budget and expenses**: envelopes, a transaction log, trends, spend alerts, "I spent X on Y" captured through the assistant.

## What we take from the reference (batch 4: calendar, communications, privacy)

- **Calendar ownership is a choice**: "this app is my calendar" (pull once, the app is the source of truth) or "two-way sync" (new events also write back to one chosen calendar). Import still picks per calendar across every device account (Google, iCloud, Exchange, Yahoo), each shown with its colour and provider.
- **Availability**: work hours as chips, buffer before and after meetings, exclude weekends, prefer morning slots. Slots are only ever offered inside the window.
- **Notifications**: morning brief at a chosen time, event reminders, a mid-day pulse when the afternoon needs attention, task-completion alerts, an optional launch cue.
- **Communications**: a Google account connection that unlocks Docs linking and Meet transcripts; an email account "to send meeting invites from your address"; a video meeting link; a notes vault hand-off.
- **Privacy and data**: biometric sign-in, memory encrypted on device, an export/import sync bundle encrypted with the user seed, a password-protected AES-256-GCM backup that merges on restore, per-feature toggles (email context in briefs, usage stats, crash reports) and "redact identifiers before cloud AI" with high-risk patterns (cards, SSNs, tokens) always redacted regardless.

### How this lands in freenotes

- **An `autopilot` context** in the domain: `Automation` (id, name, policy off|ask|auto, guard conditions as data, trust score), `ProposedAction` (what, why, evidence, reversible), `ActionLog` entries carrying an inverse action for undo. Guards are evaluated deterministically; the model only proposes. Trust is the ratio of approved to proposed over a window, and crossing the threshold flips the policy only if the user allowed that.
- **A `prediction` ledger**: the chief of staff states a confidence when it estimates effort, flags a deadline at risk or predicts a meeting outcome; the review context grades it when the item closes. This also sharpens the achievement report.
- **Two engines in our terms.** The heuristic assistant already is the on-device engine. The private-data step becomes a `Redactor` port in front of every cloud call: deterministic, reversible redaction of emails, phone numbers, card and ID patterns and tokens (always) plus names and amounts (opt-in). A small in-browser model can sit behind the same port later.
- **Calendar ownership** maps to a `CalendarPolicy` on each connected calendar: `import-only` or `two-way`, with at most one write-back target. Our scheduler already consumes busy ranges; availability (work hours, buffers, weekends, morning preference) extends `WorkingHours` in the planning context.
- **Knowledge** reuses compositions: memory facts and uploaded documents are compositions of new kinds; the graph is derived from references between todos, people, events and compositions, not stored separately.
- **Privacy** reuses the existing sealed-secret machinery for a password-protected export and keeps every outbound-data feature as an explicit, default-off toggle in `UserSettings`.
- **Scheduled jobs** are server cron on the hosted API (Vercel cron) running sync, the morning brief and the Friday draft under each user's stored policies; a self-hosted API is the "custom relay".
- **Budget** is out of scope for the next milestones; the composition model can absorb it later as an `expense` kind.

## Capture, then ask (2026-10-11)

Braindump first, organise second. Capture never assumes: an item without a deadline or a time budget in the note is asked, one card at a time, when it is due and how long to budget, with "let the assistant estimate" as an explicit choice. Only then does scheduling and step decomposition begin. The onboarding "try it" step captures and says so; it does not promise a place on the day.

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
| **profile** | Working style, goals, boundaries, memory facts, client/project tags | Facts carry provenance; nothing is remembered without the user confirming. |
| **autopilot** | Automations with Off/Ask/Auto policies, guards, trust, the action log with undo, the prediction ledger | Guards are deterministic; the model proposes, policy decides; every action is reversible or asks first. |

The existing planning, execution, review and composition contexts stay. Today's `Capture` becomes the plus button inside Actions, and the Plan and Review screens fold into Actions and the Brief.

## Ports and adapters

- `CalendarSource`, `MailSource`, `IssueSource` are ports in core. Adapters: Google (Calendar, Gmail), Microsoft Graph (Outlook calendar and mail), CalDAV/IMAP for everything else, Linear for issues. Each adapter is its own package (`@freenotes/source-google`, `@freenotes/source-linear`, ...).
- OAuth and token storage live in `@freenotes/api`, sealed with the existing `SecretBox`, one row per connected account under RLS. The browser never sees a token.
- Sync runs as scheduled server jobs with incremental cursors (Google sync tokens, Graph delta links, Linear `updatedAt` filters), writing normalised items into Supabase. The web app reads the normalised tables, so it stays fast and offline-tolerant.
- Write-backs (focus blocks, replies, issue updates) go through command endpoints that validate against the domain first.

## Delivery order

1. **Attention and onboarding.** Shipped 2026-10-10: the first-run journey (welcome, try it, eight-question working-style quiz, your day, AI disclosure, done), a `profile` context (name, style, goals, boundaries) the assistant reads on every request, style-aware attention ranking, and the "Get ready" card. Inline step capture shipped the same day.
2. **Calendar.** First half shipped 2026-10-11 without OAuth: any number of ICS feeds (Google, Outlook, iCloud all publish one), events on the brief's timeline, meetings in the day's read and the attention sheet, busy ranges into the scheduler, a server-side proxy with public-host guards, CLI commands. Still to do, and needing OAuth clients: Google and Microsoft as first-class sources with write-back of focus blocks, plus 3-day and month views.
3. **Inbox.** Gmail and Outlook threads as inbox items, triage states, commitment extraction into todos, drafted replies by the chief of staff.
4. **People.** Shipped 2026-10-11 from calendar attendees: meetings of up to six people, cadence, last and next meeting, "going cold" on the brief's people row and in the attention sheet. Nothing stored. Still to do: a People tab with notes per person once mail arrives.
5. **Issues.** Linear as a source shipped 2026-10-11 with a personal API key (no OAuth needed): assigned issues become todos with due date, estimate and priority; closing in Linear closes here; key stored encrypted per account or kept in the browser. Still to do: Linear as a sink (status write-back) and OAuth for teams.
6. **Voice capture.** Shipped 2026-10-11 on the Capture screen through the browser's speech recognition. Still to do: the floating button on every tab.

Each step ships behind the existing verify pipeline with tests at the domain layer first.

## Operator setup the integrations will need

OAuth clients registered by whoever hosts the app: a Google Cloud project with Calendar and Gmail scopes, a Microsoft Entra app registration, a Linear OAuth application. Client ids and secrets go in server environment variables; the README will document each.
