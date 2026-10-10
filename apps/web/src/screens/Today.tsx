import { useMemo, useState } from "react";
import { formatDay, formatMinutes, formatTime, LocalDate, type Todo, type Workspace } from "@freenotes/core";
import { attention, greeting, summaryLine, type AttentionItem } from "../lib/brief.js";
import type { FreenotesState } from "../lib/use-freenotes.js";
import { Icon } from "../ui/Icon.js";
import { Sheet } from "../ui/Shell.js";
import { StatusSheet } from "../ui/StatusSheet.js";
import type { Route } from "../ui/router.js";

const DOW = ["S", "M", "T", "W", "T", "F", "S"];

export function Brief({ state, workspace, navigate, name }: { state: FreenotesState; workspace: Workspace; navigate: (r: Route) => void; name?: string | undefined }) {
  const now = new Date();
  const todayKey = LocalDate.fromDate(now).toString();
  const [dayKey, setDayKey] = useState(todayKey);
  const [picked, setPicked] = useState<Todo>();
  const [attn, setAttn] = useState(false);
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

          {blocks.length === 0 ? (
            <p className="muted" style={{ padding: "4px 2px" }}>
              Nothing scheduled for {formatDay(LocalDate.parse(dayKey))}.
            </p>
          ) : (
            <div className="timeline">
              {blocks.map((b, i) => {
                const td = todoById.get(b.todoId);
                const st = statusOf(b.todoId);
                const isNow = b.range.start.getTime() <= t && t < b.range.end.getTime();
                const past = b.range.end.getTime() < t;
                const prev = blocks[i - 1];
                const gapMin = prev ? Math.round((b.range.start.getTime() - prev.range.end.getTime()) / 60000) : 0;
                return (
                  <div key={i} className="contents">
                    {gapMin >= 30 && <div className="gap">{formatMinutes(gapMin)} free</div>}
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
