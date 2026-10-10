import { useMemo, useState } from "react";
import { formatDay, formatMinutes, formatTime, LocalDate, type Todo, type Workspace } from "@freenotes/core";
import type { FreenotesState } from "../lib/use-freenotes.js";
import { EmptyState } from "../ui/Shell.js";
import { Icon } from "../ui/Icon.js";
import { StatusSheet } from "../ui/StatusSheet.js";
import type { Route } from "../ui/router.js";

export function Today({ state, workspace, navigate }: { state: FreenotesState; workspace: Workspace; navigate: (r: Route) => void }) {
  const todayKey = LocalDate.fromDate(new Date()).toString();
  const [dayKey, setDayKey] = useState(todayKey);
  const [picked, setPicked] = useState<Todo>();
  const schedule = workspace.schedule;
  const todoById = useMemo(() => new Map(workspace.todos.map((t) => [t.id, t] as const)), [workspace.todos]);
  const statusOf = (id: string) => workspace.results.find((r) => r.todoId === id)?.status;
  const open = workspace.todos.filter((t) => !["done", "skipped"].includes(statusOf(t.id) ?? ""));

  if (workspace.todos.length === 0) {
    return (
      <EmptyState
        icon="capture"
        title="Nothing on the books"
        body="Braindump everything you must do. Your chief of staff turns it into a schedule and step-by-step plans."
        action={
          <button className="btn primary" onClick={() => navigate({ tab: "capture" })}>
            Start a braindump
          </button>
        }
      />
    );
  }

  // Day strip across the schedule horizon (or the next 7 days when nothing is scheduled yet).
  const days: LocalDate[] = [];
  const start = LocalDate.fromDate(new Date());
  const span = schedule ? Math.max(7, Math.ceil((schedule.horizon.end.getTime() - Date.now()) / 86_400_000)) : 7;
  for (let i = 0; i < Math.min(span, 21); i++) days.push(start.addDays(i));

  const blocksByDay = new Map<string, NonNullable<typeof schedule>["blocks"][number][]>();
  for (const b of schedule?.blocks ?? []) {
    const k = LocalDate.fromDate(b.range.start).toString();
    blocksByDay.set(k, [...(blocksByDay.get(k) ?? []), b]);
  }
  const blocks = blocksByDay.get(dayKey) ?? [];
  const now = Date.now();
  const stale = schedule && workspace.todos.some((t) => !statusOf(t.id) && !schedule.blocks.some((b) => b.todoId === t.id) && !schedule.unscheduled.some((u) => u.todoId === t.id));

  const build = () => state.run("Building your schedule…", (app) => app.schedule());

  return (
    <div className="stack-lg">
      {!schedule ? (
        <div className="card accent stack">
          <div className="row">
            <Icon name="calendar" />
            <h2>
              {open.length} thing{open.length === 1 ? "" : "s"} to place
            </h2>
          </div>
          <p className="muted">Deadlines go first, everything else fills the gaps between them.</p>
          <button className="btn primary" disabled={!!state.busy} onClick={build}>
            Build my schedule
          </button>
        </div>
      ) : (
        <>
          <div className="days">
            {days.map((d) => {
              const k = d.toString();
              const n = blocksByDay.get(k)?.length ?? 0;
              return (
                <button key={k} className={`day-pick ${k === dayKey ? "on" : ""}`} onClick={() => setDayKey(k)}>
                  <span className="dow">{k === todayKey ? "Today" : formatDay(d).slice(0, 3)}</span>
                  <span className="dom tnum">{d.day}</span>
                  <span className={`load ${n ? "some" : ""}`} />
                </button>
              );
            })}
          </div>

          {blocks.length === 0 ? (
            <div className="card soft">
              <p className="muted">Nothing scheduled for {formatDay(LocalDate.parse(dayKey))}.</p>
            </div>
          ) : (
            <div className="timeline">
              {blocks.map((b, i) => {
                const t = todoById.get(b.todoId);
                const st = statusOf(b.todoId);
                const isNow = b.range.start.getTime() <= now && now < b.range.end.getTime();
                const past = b.range.end.getTime() < now;
                const prev = blocks[i - 1];
                const gapMin = prev ? Math.round((b.range.start.getTime() - prev.range.end.getTime()) / 60000) : 0;
                return (
                  <div key={i} className="contents">
                    {gapMin >= 30 && <div className="gap">{formatMinutes(gapMin)} free</div>}
                    <div className={`block ${t?.priority ?? ""} ${isNow ? "now" : ""} ${past && !st ? "past" : ""}`}>
                      <div className="time">
                        {formatTime(b.range.start)}
                        <br />
                        <span className="muted" style={{ fontWeight: 400 }}>
                          {formatTime(b.range.end)}
                        </span>
                      </div>
                      <div className="body" onClick={() => setPicked(t)}>
                        <div className="row between">
                          <span className="title">{t?.title ?? b.todoId}</span>
                          {st && <span className={`pill ${st}`}>{st}</span>}
                        </div>
                        <div className="sub">
                          {b.range.durationMinutes} min
                          {b.part.of > 1 ? ` · part ${b.part.index} of ${b.part.of}` : ""}
                          {isNow ? " · now" : ""}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {(schedule.warnings.length > 0 || schedule.unscheduled.length > 0) && (
            <div className="card flat stack" style={{ borderColor: "var(--warn)" }}>
              <div className="row" style={{ color: "var(--warn)" }}>
                <Icon name="warn" size={18} />
                <h3>Watch-outs</h3>
              </div>
              {schedule.warnings.map((w, i) => (
                <p key={i} className="small">
                  <strong>{todoById.get(w.todoId)?.title ?? w.todoId}</strong>
                  {w.kind === "deadline-passed" ? ` — deadline already passed.` : ` — due ${formatDay(w.deadlineAt)} ${formatTime(w.deadlineAt)}, but the plan finishes ${formatDay(w.finishesAt)} ${formatTime(w.finishesAt)}.`}
                </p>
              ))}
              {schedule.unscheduled.map((u) => (
                <p key={u.todoId} className="small">
                  <strong>{todoById.get(u.todoId)?.title ?? u.todoId}</strong> — {formatMinutes(u.remainingMinutes)} did not fit in the horizon.
                </p>
              ))}
            </div>
          )}

          <div className="row between">
            <span className="muted small">
              {schedule.blocks.length} blocks · {formatMinutes(schedule.blocks.reduce((s, b) => s + b.range.durationMinutes, 0))} planned
              {stale ? " · new todos not yet placed" : ""}
            </span>
            <button className="btn sm outline" disabled={!!state.busy} onClick={build}>
              <Icon name="refresh" size={14} /> Rebuild
            </button>
          </div>
        </>
      )}

      <StatusSheet todo={picked} state={state} onClose={() => setPicked(undefined)} onOpenPlan={(id) => navigate({ tab: "plan", id })} />
    </div>
  );
}
