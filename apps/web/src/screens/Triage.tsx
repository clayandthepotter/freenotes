import { useMemo, useState } from "react";
import { formatDeadline, formatMinutes, LocalDate, needsTriage, parseDateExpression, type Deadline, type Priority, type Todo, type Workspace } from "@freenotes/core";
import type { FreenotesState } from "../lib/use-freenotes.js";
import { Icon } from "../ui/Icon.js";
import { EmptyState } from "../ui/Shell.js";
import type { Route } from "../ui/router.js";

/**
 * After a braindump, each item gets two questions: when is it due, and how much time to budget.
 * Nothing is assumed on the executive's behalf; the assistant estimates only when asked to.
 */
type DueChoice = "keep" | "today" | "tomorrow" | "week" | "next-week" | "none" | "date";
type TimeChoice = "keep" | 15 | 30 | 60 | 120 | 240 | "custom" | "assistant";

const TIME_CHIPS: Array<[TimeChoice, string]> = [
  [15, "15m"],
  [30, "30m"],
  [60, "1h"],
  [120, "2h"],
  [240, "Half day"],
  ["custom", "Other"],
  ["assistant", "Let the assistant estimate"],
];

export function Triage({ state, workspace, navigate }: { state: FreenotesState; workspace: Workspace; navigate: (r: Route) => void }) {
  const statusOf = (id: string) => workspace.results.find((r) => r.todoId === id)?.status;
  const pending = workspace.todos.filter((t) => needsTriage(t) && !["done", "skipped"].includes(statusOf(t.id) ?? ""));
  const total = workspace.todos.filter((t) => !["done", "skipped"].includes(statusOf(t.id) ?? "")).length;
  const todo = pending[0];
  const answered = total - pending.length;

  if (!todo) {
    const open = workspace.todos.filter((t) => !["done", "skipped"].includes(statusOf(t.id) ?? ""));
    return (
      <div className="stack-lg">
        <EmptyState
          icon="check"
          title={open.length ? "Every item has its answers" : "Nothing to triage"}
          body={open.length ? "Due dates and time budgets are set. Next, put them on the calendar; then each one gets its steps." : "Capture a braindump first."}
          action={
            open.length ? (
              <button className="btn primary" disabled={!!state.busy} onClick={() => state.run("Building your schedule…", (app) => app.schedule()).then(() => navigate({ tab: "today" }))}>
                <Icon name="calendar" size={16} /> Build my schedule
              </button>
            ) : (
              <button className="btn primary" onClick={() => navigate({ tab: "capture" })}>
                Capture
              </button>
            )
          }
        />
      </div>
    );
  }

  return (
    <div className="stack-lg">
      <div className="row between">
        <span className="muted small counter">
          {answered + 1} of {total}
        </span>
        <button className="link small" disabled={!!state.busy} onClick={() => skipAll(state, pending)}>
          Skip the rest
        </button>
      </div>
      <TriageCard key={todo.id} todo={todo} state={state} onDone={() => undefined} />
    </div>
  );
}

async function skipAll(state: FreenotesState, pending: readonly Todo[]) {
  await state.run("Keeping defaults…", async (app) => {
    for (const t of pending) await app.triage({ todoId: t.id });
  });
}

function TriageCard({ todo, state, onDone }: { todo: Todo; state: FreenotesState; onDone: () => void }) {
  const today = useMemo(() => LocalDate.fromDate(new Date()), []);
  const hasDeadline = Boolean(todo.deadline);
  const hasBudget = todo.estimateSource === "explicit";
  const [due, setDue] = useState<DueChoice | undefined>(hasDeadline ? "keep" : undefined);
  const [dueDate, setDueDate] = useState("");
  const [time, setTime] = useState<TimeChoice | undefined>(hasBudget ? "keep" : undefined);
  const [custom, setCustom] = useState("");
  const [priority, setPriority] = useState<Priority>(todo.priority);

  const deadlineFor = (): Deadline | null | undefined => {
    switch (due) {
      case undefined:
      case "keep":
        return undefined;
      case "none":
        return null;
      case "today":
        return { date: today };
      case "tomorrow":
        return { date: today.addDays(1) };
      case "week":
        return { date: today.nextWeekday(5) };
      case "next-week":
        return { date: today.addDays(7).nextWeekday(5) };
      case "date":
        return dueDate ? { date: LocalDate.parse(dueDate) } : undefined;
    }
  };
  const customMinutes = (() => {
    const t = custom.trim();
    if (!t) return undefined;
    const parsed = /^(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?)$/i.exec(t) ? Math.round(Number(/^(\d+(?:\.\d+)?)/.exec(t)![1]) * 60) : /^(\d+)\s*(m|min|mins|minutes?)?$/i.exec(t) ? Number(/^(\d+)/.exec(t)![1]) : undefined;
    return parsed && parsed > 0 ? parsed : undefined;
  })();
  const estimateFor = (): number | "assistant" | undefined => (time === undefined || time === "keep" ? undefined : time === "custom" ? customMinutes : time);
  // Both questions need an answer (or an explicit "keep what I wrote"); nothing is chosen for the executive.
  const ready = due !== undefined && time !== undefined && (due !== "date" || Boolean(dueDate)) && (time !== "custom" || customMinutes !== undefined);
  const preview = due === undefined ? "" : due === "keep" ? (todo.deadline ? `due ${formatDeadline(todo)}` : "") : due === "none" ? "no deadline, fits a gap" : (() => {
    const d = deadlineFor();
    return d ? `due ${formatDeadline({ ...todo, deadline: d })}` : "";
  })();

  const save = async () => {
    const deadline = deadlineFor();
    const estimate = estimateFor();
    const out = await state.run("Saving…", (app) => app.triage({ todoId: todo.id, ...(deadline !== undefined ? { deadline } : {}), ...(estimate !== undefined ? { estimate } : {}), priority }));
    if (out) onDone();
  };

  return (
    <div className="card stack triage">
      <div>
        <span className="mono">{todo.id}</span>
        <h2 style={{ marginTop: 4 }}>{todo.title}</h2>
      </div>

      <div className="q">
        <div className="q-title">When is it due?</div>
        {hasDeadline && (
          <p className="muted small">
            From your note: {formatDeadline(todo)}.{" "}
            {due === "keep" ? (
              <button className="link small" onClick={() => setDue(undefined)}>
                Change
              </button>
            ) : (
              <button className="link small" onClick={() => setDue("keep")}>
                Keep it
              </button>
            )}
          </p>
        )}
        {due !== "keep" && (
          <div className="chips wrap">
            {(
              [
                ["today", "Today"],
                ["tomorrow", "Tomorrow"],
                ["week", "This week"],
                ["next-week", "Next week"],
                ["date", "Pick a date"],
                ["none", "No deadline"],
              ] as Array<[DueChoice, string]>
            ).map(([c, label]) => (
              <button key={c} className={`chip ${due === c ? "on" : ""}`} onClick={() => setDue(c)}>
                {label}
              </button>
            ))}
          </div>
        )}
        {due === "date" && <input type="date" className="ob-input" value={dueDate} min={today.toString()} onChange={(e) => setDueDate(e.target.value)} aria-label="Due date" />}
      </div>

      <div className="q">
        <div className="q-title">How much time should we budget?</div>
        {hasBudget && (
          <p className="muted small">
            From your note: {formatMinutes(todo.estimatedMinutes)}.{" "}
            {time === "keep" ? (
              <button className="link small" onClick={() => setTime(undefined)}>
                Change
              </button>
            ) : (
              <button className="link small" onClick={() => setTime("keep")}>
                Keep it
              </button>
            )}
          </p>
        )}
        {time !== "keep" && (
          <div className="chips wrap">
            {TIME_CHIPS.map(([c, label]) => (
              <button key={String(c)} className={`chip ${time === c ? "on" : ""} ${c === "assistant" ? "outline" : ""}`} onClick={() => setTime(c)}>
                {c === "assistant" && <Icon name="sparkle" size={13} />}
                {label}
              </button>
            ))}
          </div>
        )}
        {time === "custom" && <input className="ob-input" inputMode="numeric" placeholder="e.g. 45m or 3h" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Time budget" />}
      </div>

      <div className="q">
        <div className="q-title">Priority</div>
        <div className="chips">
          {(["high", "normal", "low"] as Priority[]).map((p) => (
            <button key={p} className={`chip ${priority === p ? "on" : ""}`} onClick={() => setPriority(p)}>
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="row between" style={{ alignItems: "center" }}>
        <span className="muted small">{preview}</span>
        <div className="btn-row">
          <button className="btn outline sm" disabled={!!state.busy} onClick={() => state.run("Skipping…", (app) => app.triage({ todoId: todo.id })).then(() => onDone())}>
            Skip
          </button>
          <button className="btn primary sm" disabled={!ready || !!state.busy} onClick={save}>
            Next <Icon name="arrow" size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Used by the CLI-style free text on the capture screen: "friday", "oct 20", "next week". */
export function deadlineFromText(text: string): Deadline | undefined {
  return parseDateExpression(text, LocalDate.fromDate(new Date()));
}
