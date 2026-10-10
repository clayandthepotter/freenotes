import { useState } from "react";
import { formatDay, formatMinutes, formatTime, LocalDate, LocalTime, WorkingHours, type Weekday, type Workspace } from "@freenotes/core";
import type { FreenotesState } from "../lib/use-freenotes.js";

const DAYS: Array<[Weekday, string]> = [
  [1, "Mon"],
  [2, "Tue"],
  [3, "Wed"],
  [4, "Thu"],
  [5, "Fri"],
  [6, "Sat"],
  [0, "Sun"],
];

export function ScheduleView({ state, workspace }: { state: FreenotesState; workspace: Workspace }) {
  const wh = workspace.settings.workingHours.toJSON();
  const first = Object.values(wh)[0] ?? { start: "09:00", end: "17:00" };
  const [start, setStart] = useState(first.start);
  const [end, setEnd] = useState(first.end);
  const [days, setDays] = useState<Set<Weekday>>(new Set(Object.keys(wh).map((k) => Number(k) as Weekday)));
  const [horizon, setHorizon] = useState(workspace.settings.policy.horizonDays);

  const build = async () => {
    await state.run("Building schedule…", async (app) => {
      const spec: Partial<Record<Weekday, { start: LocalTime; end: LocalTime }>> = {};
      for (const d of days) spec[d] = { start: LocalTime.parse(start), end: LocalTime.parse(end) };
      await app.updateSettings((s) => ({ workingHours: WorkingHours.of(spec), policy: { ...s.policy, horizonDays: horizon } }));
      return app.schedule();
    });
  };

  const schedule = workspace.schedule;
  const todo = (id: string) => workspace.todos.find((t) => t.id === id);
  const open = workspace.todos.filter((t) => !workspace.results.some((r) => r.todoId === t.id && (r.status === "done" || r.status === "skipped")));

  const byDay = new Map<string, typeof schedule extends undefined ? never : NonNullable<typeof schedule>["blocks"][number][]>();
  for (const b of schedule?.blocks ?? []) {
    const k = LocalDate.fromDate(b.range.start).toString();
    byDay.set(k, [...(byDay.get(k) ?? []), b]);
  }

  return (
    <section>
      <header className="section-head">
        <h2>2 · Schedule</h2>
        <p>Deadline items are placed earliest-deadline-first; everything else fills the gaps by priority. Long items are split into focus blocks.</p>
      </header>
      <div className="settings-grid">
        <label>
          Working hours
          <span className="inline">
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} /> – <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </span>
        </label>
        <label>
          Working days
          <span className="inline days">
            {DAYS.map(([d, name]) => (
              <button
                key={d}
                type="button"
                className={days.has(d) ? "chip on" : "chip"}
                onClick={() => {
                  const next = new Set(days);
                  if (next.has(d)) next.delete(d);
                  else next.add(d);
                  setDays(next);
                }}
              >
                {name}
              </button>
            ))}
          </span>
        </label>
        <label>
          Horizon (days)
          <input type="number" min={1} max={60} value={horizon} onChange={(e) => setHorizon(Number(e.target.value) || 1)} />
        </label>
        <button className="primary" disabled={open.length === 0 || days.size === 0 || !!state.busy} onClick={build}>
          {schedule ? "Rebuild schedule" : "Build schedule"} ({open.length} open)
        </button>
      </div>

      {schedule && (
        <>
          <p className="muted">
            Generated {formatDay(schedule.generatedAt)} {formatTime(schedule.generatedAt)} · {schedule.blocks.length} blocks ·{" "}
            {formatMinutes(schedule.blocks.reduce((s, b) => s + b.range.durationMinutes, 0))} planned
          </p>
          {schedule.warnings.length > 0 && (
            <div className="callout warn">
              <strong>Watch-outs</strong>
              <ul>
                {schedule.warnings.map((w, i) => (
                  <li key={i}>
                    <span className="mono">{w.todoId}</span> {todo(w.todoId)?.title}:{" "}
                    {w.kind === "deadline-passed"
                      ? `deadline already passed (${formatDay(w.deadlineAt)} ${formatTime(w.deadlineAt)}).`
                      : `due ${formatDay(w.deadlineAt)} ${formatTime(w.deadlineAt)} but finishes ${formatDay(w.finishesAt)} ${formatTime(w.finishesAt)}.`}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {schedule.unscheduled.length > 0 && (
            <div className="callout">
              <strong>Did not fit</strong>
              <ul>
                {schedule.unscheduled.map((u) => (
                  <li key={u.todoId}>
                    <span className="mono">{u.todoId}</span> {todo(u.todoId)?.title}: {formatMinutes(u.remainingMinutes)} left over.
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="days-grid">
            {[...byDay.entries()].map(([day, blocks]) => (
              <div className="day" key={day}>
                <h4>{formatDay(blocks[0]!.range.start)}</h4>
                {blocks.map((b, i) => (
                  <div className={`block ${todo(b.todoId)?.priority ?? ""}`} key={i}>
                    <span className="time">
                      {formatTime(b.range.start)}–{formatTime(b.range.end)}
                    </span>
                    <span className="mono">{b.todoId}</span> {todo(b.todoId)?.title}
                    {b.part.of > 1 && (
                      <span className="muted">
                        {" "}
                        · {b.part.index}/{b.part.of}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
