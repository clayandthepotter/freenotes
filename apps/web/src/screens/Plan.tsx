import { useEffect, useRef, useState } from "react";
import { formatDeadline, formatMinutes, progressFor, stepWantsWriting, type ExecutionStep, type StepProgress, type Workspace } from "@freenotes/core";
import type { FreenotesState } from "../lib/use-freenotes.js";
import { Icon } from "../ui/Icon.js";
import { EmptyState } from "../ui/Shell.js";
import { StatusSheet } from "../ui/StatusSheet.js";
import { TodoCard } from "../ui/TodoCard.js";
import type { Route } from "../ui/router.js";

export function PlanList({ state, workspace, navigate }: { state: FreenotesState; workspace: Workspace; navigate: (r: Route) => void }) {
  const statusOf = (id: string) => workspace.results.find((r) => r.todoId === id)?.status;
  const open = workspace.todos.filter((t) => !["done", "skipped"].includes(statusOf(t.id) ?? ""));
  const unplanned = open.filter((t) => !workspace.plans[t.id]);
  if (workspace.todos.length === 0) {
    return <EmptyState icon="plan" title="No plans yet" body="Capture a braindump first; then each todo gets step-by-step execution parameters." action={<button className="btn primary" onClick={() => navigate({ tab: "capture" })}>Capture</button>} />;
  }
  return (
    <div className="stack-lg">
      {unplanned.length > 0 && (
        <div className="card accent row between">
          <div>
            <h3>
              {unplanned.length} todo{unplanned.length === 1 ? "" : "s"} without a plan
            </h3>
            <p className="muted small">Let the chief of staff decompose them.</p>
          </div>
          <button className="btn primary sm" disabled={!!state.busy} onClick={() => state.run("Planning everything…", (app) => app.planAll())}>
            Plan all
          </button>
        </div>
      )}
      <div className="todo-list">
        {open.map((t) => (
          <TodoCard key={t.id} todo={t} status={statusOf(t.id)} planned={Boolean(workspace.plans[t.id])} onClick={() => navigate({ tab: "plan", id: t.id })} />
        ))}
      </div>
      {open.length === 0 && <p className="muted" style={{ textAlign: "center" }}>Everything is done or skipped. Time for a review.</p>}
    </div>
  );
}

export function PlanDetail({ state, workspace, id }: { state: FreenotesState; workspace: Workspace; id: string }) {
  const todo = workspace.todos.find((t) => t.id === id);
  const plan = workspace.plans[id];
  const result = workspace.results.find((r) => r.todoId === id);
  const progress = progressFor(workspace.progress, id);
  const [sheet, setSheet] = useState(false);
  if (!todo) return <EmptyState icon="plan" title="Unknown todo" body={`There is no todo ${id}.`} />;

  const complete = progress.filter((p) => p.done).length;
  const save = async (step: number, patch: { done?: boolean; note?: string }) => {
    if (!state.app) return;
    try {
      await state.app.step(id, step, patch);
      await state.reload();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="stack-lg">
      <div className="card">
        <div className="row between">
          <span className="mono">{todo.id}</span>
          {result && <span className={`pill ${result.status}`}>{result.status}</span>}
        </div>
        <h2 style={{ marginTop: 6 }}>{todo.title}</h2>
        <p className="muted small" style={{ marginTop: 4 }}>
          {todo.priority} priority · {formatMinutes(todo.estimatedMinutes)}
          {todo.deadline ? ` · due ${formatDeadline(todo)}` : ""}
        </p>
        <div className="btn-row" style={{ marginTop: 14 }}>
          <button className="btn outline" disabled={!!state.busy} onClick={() => state.run(`Planning ${todo.id}…`, (app) => app.plan(todo.id))}>
            <Icon name="sparkle" size={16} /> {plan ? "Re-plan" : "Plan this"}
          </button>
          <button className="btn primary" onClick={() => setSheet(true)}>
            Record outcome
          </button>
        </div>
      </div>

      {plan ? (
        <>
          <div className="card accent">
            <p className="muted small" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Start here</p>
            <p style={{ fontWeight: 600, marginTop: 4 }}>{plan.firstAction}</p>
          </div>
          <div className="stack">
            <div className="section-title">
              <h2>Steps</h2>
              <span className="muted small">
                {complete}/{plan.steps.length}
              </span>
            </div>
            <ol className="steps">
              {plan.steps.map((s) => (
                <StepRow key={`${id}-${s.order}`} step={s} progress={progress.find((p) => p.step === s.order)} onSave={(patch) => save(s.order, patch)} />
              ))}
            </ol>
            <p className="muted small" style={{ textAlign: "center" }}>Whatever you write here is kept with the todo and goes into your results.</p>
          </div>
          <div className="card flat">
            <p className="muted small" style={{ fontWeight: 700 }}>Objective</p>
            <p>{plan.objective}</p>
          </div>
          <div className="kv">
            <div className="card flat">
              <h3>Done when</h3>
              <ul>{plan.definitionOfDone.map((d, i) => <li key={i}>{d}</li>)}</ul>
            </div>
            <div className="card flat">
              <h3>Have at hand</h3>
              <ul>{plan.inputs.map((d, i) => <li key={i}>{d}</li>)}</ul>
            </div>
            <div className="card flat">
              <h3>Watch for</h3>
              <ul>{plan.risks.map((d, i) => <li key={i}>{d}</li>)}</ul>
            </div>
          </div>
          <p className="muted small" style={{ textAlign: "center" }}>Prepared by the {plan.source} chief of staff.</p>
        </>
      ) : (
        <EmptyState icon="sparkle" title="No plan yet" body="Ask your chief of staff to decompose this into concrete steps, a first action, and a definition of done." />
      )}

      {sheet && <StatusSheet todo={todo} state={state} onClose={() => setSheet(false)} />}
    </div>
  );
}

/**
 * One plan step: tick it, and write its answer right here. Steps whose output is text
 * (a sentence, a list, a decision) open the writing area by default; others offer it on demand.
 */
function StepRow({ step, progress, onSave }: { step: ExecutionStep; progress: StepProgress | undefined; onSave: (patch: { done?: boolean; note?: string }) => Promise<void> }) {
  const saved = progress?.note ?? "";
  const done = progress?.done ?? false;
  const [draft, setDraft] = useState(saved);
  const [writing, setWriting] = useState(saved !== "" || stepWantsWriting(step));
  const lastSaved = useRef(saved);
  const timer = useRef<number | undefined>(undefined);
  const area = useRef<HTMLTextAreaElement>(null);

  // Adopt a note that changed elsewhere (another device, the CLI) unless the user is mid-edit.
  useEffect(() => {
    if (saved !== lastSaved.current && draft === lastSaved.current) setDraft(saved);
    lastSaved.current = saved;
  }, [saved, draft]);

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft, writing]);

  const commit = (value: string) => {
    window.clearTimeout(timer.current);
    if (value.replace(/\s+$/u, "") === lastSaved.current) return;
    lastSaved.current = value.replace(/\s+$/u, "");
    void onSave({ note: value });
  };

  const onChange = (value: string) => {
    setDraft(value);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => commit(value), 800);
  };

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <li className={done ? "done" : ""}>
      <button type="button" className="num" aria-label={done ? `Mark step ${step.order} not done` : `Mark step ${step.order} done`} aria-pressed={done} onClick={() => void onSave({ done: !done })}>
        {done ? <Icon name="check" size={14} strokeWidth={3} /> : step.order}
      </button>
      <div className="body">
        <div className="action" onClick={() => void onSave({ done: !done })}>
          {step.action}
          {step.estimatedMinutes ? <span className="muted"> · {formatMinutes(step.estimatedMinutes)}</span> : null}
        </div>
        {step.detail && <div className="detail">{step.detail}</div>}
        {writing ? (
          <textarea
            ref={area}
            className="step-note"
            rows={1}
            value={draft}
            placeholder="Write it here"
            aria-label={`Notes for step ${step.order}`}
            onChange={(e) => onChange(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
          />
        ) : (
          <button type="button" className="link small" onClick={() => setWriting(true)}>
            <Icon name="plus" size={13} /> Write something
          </button>
        )}
      </div>
    </li>
  );
}
