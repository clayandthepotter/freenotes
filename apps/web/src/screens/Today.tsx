import { useMemo, useState } from "react";
import { eventsOn, formatDay, formatMinutes, formatTime, LocalDate, LocalTime, TimeRange, type CalendarEvent, type TimeBlock, type Todo, type Workspace } from "@freenotes/core";
import { attention, greeting, people as derive, summaryLine, type AttentionItem } from "../lib/brief.js";
import type { FreenotesState } from "../lib/use-freenotes.js";
import { Icon } from "../ui/Icon.js";
import { Sheet } from "../ui/Shell.js";
import { StatusSheet } from "../ui/StatusSheet.js";
import type { Route } from "../ui/router.js";

const DOW = ["S", "M", "T", "W", "T", "F", "S"];

export function Brief({ state, workspace, navigate, name, signedIn, canSignIn, selfEmail }: { state: FreenotesState; workspace: Workspace; navigate: (r: Route) => void; name?: string | undefined; signedIn: boolean; canSignIn: boolean; selfEmail?: string | undefined }) {
  const now = new Date();
  const todayKey = LocalDate.fromDate(now).toString();
  const [dayKey, setDayKey] = useState(todayKey);
  const [picked, setPicked] = useState<Todo>();
  const [attn, setAttn] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const people = useMemo(() => derive(workspace, now, selfEmail), [workspace, selfEmail]); // eslint-disable-line react-hooks/exhaustive-deps
  const cold = people.filter((p) => p.status === "cold");
  const schedule = workspace.schedule;
  const todoById = useMemo(() => new Map(workspace.todos.map((t) => [t.id, t] as const)), [workspace.todos]);
  const statusOf = (id: string) => workspace.results.find((r) => r.todoId === id)?.status;
  const open = workspace.todos.filter((t) => !["done", "skipped"].includes(statusOf(t.id) ?? ""));

  // Rolling seven-day strip from today; days with work get a pip.
  const start = LocalDate.fromDate(now);
  const days = Array.from({ length: 7 }, (_, i) => start.addDays(i));
  const blocksByDay = new Map<string, NonNullable<typeof schedule>["blocks"][number][]>();
  for (const b of schedule?.blocks ?? []) {
    const k = LocalDate.fromDate(b.range.start).toString();
    blocksByDay.set(k, [...(blocksByDay.get(k) ?? []), b]);
  }
  const blocks = blocksByDay.get(dayKey) ?? [];
  const day = LocalDate.parse(dayKey);
  const dayEvents = eventsOn(workspace.calendar.events, TimeRange.of(day.at(LocalTime.of(0)), day.addDays(1).at(LocalTime.of(0))));
  const allDay = dayEvents.filter((e) => e.allDay);
  const timed = dayEvents.filter((e) => !e.allDay);
  const calendarById = new Map(workspace.calendar.calendars.map((c) => [c.id, c] as const));
  type Slot = { kind: "block"; at: Date; end: Date; block: TimeBlock } | { kind: "event"; at: Date; end: Date; event: CalendarEvent };
  const slots: Slot[] = [...blocks.map((b): Slot => ({ kind: "block", at: b.range.start, end: b.range.end, block: b })), ...timed.map((e): Slot => ({ kind: "event", at: e.range.start, end: e.range.end, event: e }))].sort((a, b) => a.at.getTime() - b.at.getTime());
  const t = now.getTime();
  const upNext = (schedule?.blocks ?? []).filter((b) => b.range.end.getTime() > t && !["done", "skipped"].includes(statusOf(b.todoId) ?? "")).sort((a, b) => a.range.start.getTime() - b.range.start.getTime())[0];
  const items = attention(workspace, now);
  const build = () => state.run("Building your schedule…", (app) => app.schedule());

  const act = (item: AttentionItem) => {
    setAttn(false);
    switch (item.kind) {
      case "capture":
        return navigate({ tab: "capture" });
      case "review":
        return navigate({ tab: "review" });
      case "unplanned":
        return navigate(item.todoId ? { tab: "plan", id: item.todoId } : { tab: "plan" });
      case "unrecorded":
        return setPicked(item.todoId ? todoById.get(item.todoId) : undefined);
      default:
        return item.todoId ? navigate({ tab: "plan", id: item.todoId }) : undefined;
    }
  };

  return (
    <div className="stack-lg">
      <header className="brief-head">
        <div className="date">{formatDay(now)}</div>
        <h1>{greeting(now, name)}</h1>
        <p className="summary">{summaryLine(workspace, now)}</p>
      </header>

      <GetReady workspace={workspace} state={state} navigate={navigate} signedIn={signedIn} canSignIn={canSignIn} />

      <div className="week" role="tablist" aria-label="Week">
        {days.map((d) => {
          const k = d.toString();
          const n = blocksByDay.get(k)?.length ?? 0;
          return (
            <button key={k} role="tab" aria-selected={k === dayKey} className={`wday ${k === dayKey ? "on" : ""} ${k === todayKey ? "today" : ""} ${n ? "some" : ""}`} onClick={() => setDayKey(k)}>
              <span className="dow">{DOW[d.weekday()]}</span>
              <span className="dom">{d.day}</span>
              <span className="pip" />
            </button>
          );
        })}
      </div>

      {workspace.todos.length > 0 && (
        <div className="hero">
          <button className="cta" onClick={() => setAttn(true)}>
            <Icon name="sparkle" size={18} /> What needs my attention?
          </button>
          <button className="fab" aria-label="Capture" onClick={() => navigate({ tab: "capture" })}>
            <Icon name="plus" size={22} strokeWidth={2} />
          </button>
        </div>
      )}

      {workspace.todos.length === 0 ? (
        <div className="card accent stack">
          <h2>Start with a braindump</h2>
          <p className="muted">Everything you must do, one line each. Deadlines, effort and priority are optional; your chief of staff fills the gaps.</p>
          <button className="btn primary" onClick={() => navigate({ tab: "capture" })}>
            Capture
          </button>
        </div>
      ) : !schedule ? (
        <div className="card accent stack">
          <h2>
            {open.length} thing{open.length === 1 ? "" : "s"} to place
          </h2>
          <p className="muted">Deadlines go first; everything else fills the gaps between them.</p>
          <button className="btn primary" disabled={!!state.busy} onClick={build}>
            Build my schedule
          </button>
        </div>
      ) : (
        <>
          {upNext && dayKey === todayKey && (
            <div className="upnext" onClick={() => setPicked(todoById.get(upNext.todoId))}>
              <div className="grow">
                <div className="kicker">{upNext.range.start.getTime() <= t ? "Now" : "Up next"}</div>
                <div className="t">{todoById.get(upNext.todoId)?.title ?? upNext.todoId}</div>
                <div className="s">
                  {formatDay(upNext.range.start)} {formatTime(upNext.range.start)}–{formatTime(upNext.range.end)}
                  {workspace.plans[upNext.todoId] ? " · plan ready" : ""}
                </div>
              </div>
              <Icon name="chevron" size={18} />
            </div>
          )}

          {allDay.length > 0 && (
            <div className="chips allday" aria-label="All day">
              {allDay.map((e) => (
                <span key={`${e.uid}-${e.range.start.getTime()}`} className="chip" style={{ background: "var(--surface-2)", color: calendarById.get(e.calendarId)?.color ?? "var(--text-2)" }}>
                  {e.title}
                </span>
              ))}
            </div>
          )}

          {slots.length === 0 ? (
            <p className="muted" style={{ padding: "4px 2px" }}>
              Nothing scheduled for {formatDay(day)}.
            </p>
          ) : (
            <div className="timeline">
              {slots.map((slot, i) => {
                const isNow = slot.at.getTime() <= t && t < slot.end.getTime();
                const past = slot.end.getTime() < t;
                const prev = slots[i - 1];
                const gapMin = prev ? Math.round((slot.at.getTime() - prev.end.getTime()) / 60000) : 0;
                const gap = gapMin >= 30 && <div className="gap">{formatMinutes(gapMin)} free</div>;
                if (slot.kind === "event") {
                  const e = slot.event;
                  const color = calendarById.get(e.calendarId)?.color ?? "var(--muted)";
                  return (
                    <div key={`e-${e.uid}-${slot.at.getTime()}`} className="contents">
                      {gap}
                      <div className={`block event ${isNow ? "now" : ""} ${past ? "past" : ""}`} style={{ "--cal": color } as React.CSSProperties}>
                        <div className="time">
                          {formatTime(e.range.start)}
                          <br />
                          <span className="muted" style={{ fontWeight: 400 }}>
                            {formatTime(e.range.end)}
                          </span>
                        </div>
                        <div className="body static">
                          <div className="row between">
                            <span className="title">{e.title}</span>
                            <span className="pill cal" style={{ color }}>
                              {calendarById.get(e.calendarId)?.label ?? "calendar"}
                            </span>
                          </div>
                          <div className="sub">
                            {e.range.durationMinutes} min
                            {e.location ? ` · ${e.location}` : ""}
                            {e.attendees.length ? ` · ${e.attendees.slice(0, 2).join(", ")}${e.attendees.length > 2 ? ` +${e.attendees.length - 2}` : ""}` : ""}
                            {e.status === "tentative" ? " · tentative" : ""}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }
                const b = slot.block;
                const td = todoById.get(b.todoId);
                const st = statusOf(b.todoId);
                return (
                  <div key={`b-${i}`} className="contents">
                    {gap}
                    <div className={`block ${td?.priority ?? ""} ${isNow ? "now" : ""} ${past && !st ? "past" : ""}`}>
                      <div className="time">
                        {formatTime(b.range.start)}
                        <br />
                        <span className="muted" style={{ fontWeight: 400 }}>
                          {formatTime(b.range.end)}
                        </span>
                      </div>
                      <div className="body" onClick={() => setPicked(td)}>
                        <div className="row between">
                          <span className="title">{td?.title ?? b.todoId}</span>
                          {st && <span className={`pill ${st}`}>{st}</span>}
                        </div>
                        <div className="sub">
                          {b.range.durationMinutes} min{b.part.of > 1 ? ` · part ${b.part.index} of ${b.part.of}` : ""}
                          {isNow ? " · now" : ""}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="row between">
            <span className="muted small">
              {schedule.blocks.length} blocks · {formatMinutes(schedule.blocks.reduce((s, b) => s + b.range.durationMinutes, 0))} planned
            </span>
            <button className="btn sm outline" disabled={!!state.busy} onClick={build}>
              <Icon name="refresh" size={14} /> Rebuild
            </button>
          </div>
        </>
      )}

      {people.length > 0 && (
        <div className="upnext people" onClick={() => setPeopleOpen(true)} role="button">
          <span className="k">
            <Icon name="user" size={18} />
          </span>
          <div className="grow">
            <div className="t">
              {people.length} {people.length === 1 ? "person" : "people"} you meet
            </div>
            <div className="s">{cold.length === 0 ? "No one going cold." : `${cold.length} going cold: ${cold.slice(0, 2).map((p) => p.name).join(", ")}${cold.length > 2 ? "…" : ""}`}</div>
          </div>
          <Icon name="chevron" size={18} />
        </div>
      )}

      <Sheet open={peopleOpen} onClose={() => setPeopleOpen(false)} title="People">
        <p className="muted small" style={{ marginBottom: 8 }}>Read from your calendars: meetings with up to six people. Nothing is stored.</p>
        {people.map((p) => {
          const days = p.lastSeen ? Math.round((now.getTime() - p.lastSeen.getTime()) / 86_400_000) : undefined;
          return (
            <div key={p.name} className={`attn person ${p.status}`}>
              <span className="k">{p.name.charAt(0).toUpperCase()}</span>
              <div className="grow">
                <div className="row between">
                  <span className="t">{p.name}</span>
                  {p.status === "cold" && <span className="pill blocked">going cold</span>}
                </div>
                <div className="muted small">
                  {p.meetings} meeting{p.meetings === 1 ? "" : "s"}
                  {p.cadenceDays ? ` · every ${p.cadenceDays} days` : ""}
                  {days !== undefined ? ` · last ${days === 0 ? "today" : `${days}d ago`}` : ""}
                  {p.nextSeen ? ` · next ${formatDay(p.nextSeen)}` : " · nothing scheduled"}
                </div>
              </div>
            </div>
          );
        })}
      </Sheet>

      <Sheet open={attn} onClose={() => setAttn(false)} title="Right now">
        {items.length === 0 ? (
          <p className="muted">Nothing needs you. Enjoy it.</p>
        ) : (
          <div>
            {items.map((it, i) => (
              <div key={i} className={`attn ${it.kind}`} onClick={() => act(it)}>
                <span className="k">
                  <Icon name={it.kind === "now" ? "play" : it.kind === "risk" || it.kind === "overdue" ? "warn" : it.kind === "review" ? "review" : it.kind === "capture" ? "capture" : it.kind === "unrecorded" ? "flag" : "list"} size={17} />
                </span>
                <div className="grow">
                  <div className="t">{it.title}</div>
                  <div className="d">{it.detail}</div>
                </div>
                <Icon name="chevron" size={16} />
              </div>
            ))}
          </div>
        )}
      </Sheet>

      <StatusSheet todo={picked} state={state} onClose={() => setPicked(undefined)} onOpenPlan={(id) => navigate({ tab: "plan", id })} />
    </div>
  );
}

const DISMISS_KEY = "freenotes.setup.dismissed";

/** The setup card: what is still missing to make freenotes fully yours. Dismissible, comes back when something new is missing. */
function GetReady({ workspace, state, navigate, signedIn, canSignIn }: { workspace: Workspace; state: FreenotesState; navigate: (r: Route) => void; signedIn: boolean; canSignIn: boolean }) {
  const items: Array<{ key: string; title: string; body: string; action: string; go: () => void }> = [];
  if (!workspace.profile.name) items.push({ key: "name", title: "Add your name", body: "Your brief and your reports address you properly.", action: "Add", go: () => navigate({ tab: "setup" }) });
  if (!workspace.profile.style) items.push({ key: "style", title: "Find your working style", body: "Eight quick questions. The brief and the plans adapt to the answer.", action: "Start", go: () => navigate({ tab: "setup" }) });
  const heuristic = state.assistant ? !state.assistant.online || state.assistant.status?.name === "heuristic" : false;
  if (heuristic) items.push({ key: "model", title: "Connect a model", body: "Sharper plans and reports with your own Anthropic or OpenAI key. Offline heuristics until then.", action: "Connect", go: () => navigate({ tab: "settings" }) });
  if (workspace.calendar.calendars.length === 0) items.push({ key: "calendar", title: "Connect your calendars", body: "Paste the private ICS link from Google, Outlook or iCloud. Meetings show on the brief and are kept out of your focus blocks.", action: "Connect", go: () => navigate({ tab: "settings", id: "calendars" }) });
  if (!state.linearConnected) items.push({ key: "linear", title: "Connect Linear", body: "The issues assigned to you become todos; what you close there closes here.", action: "Connect", go: () => navigate({ tab: "settings", id: "linear" }) });
  if (!signedIn && canSignIn) items.push({ key: "account", title: "Sign in to sync", body: "Keep your workspace on every device. Magic link, no password.", action: "Sign in", go: () => navigate({ tab: "settings" }) });
  const signature = items.map((i) => i.key).join(",");
  const [dismissed, setDismissed] = useState(() => {
    try {
      return window.localStorage.getItem(DISMISS_KEY) === signature;
    } catch {
      return false;
    }
  });
  if (items.length === 0 || dismissed) return null;
  return (
    <section className="card setup stack" aria-label="Get ready">
      <div className="row between">
        <h2>Get ready</h2>
        <button
          className="link small"
          onClick={() => {
            try {
              window.localStorage.setItem(DISMISS_KEY, signature);
            } catch {
              /* private mode */
            }
            setDismissed(true);
          }}
        >
          Later
        </button>
      </div>
      {items.map((i) => (
        <div key={i.key} className="setup-item">
          <div className="grow">
            <div className="t">{i.title}</div>
            <div className="muted small">{i.body}</div>
          </div>
          <button className="btn sm outline" onClick={i.go}>
            {i.action}
          </button>
        </div>
      ))}
      <div className="muted small">Mail: coming next.</div>
    </section>
  );
}
