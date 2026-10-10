import { useState } from "react";
import { formatMinutes, type Workspace } from "@freenotes/core";
import type { FreenotesState } from "../lib/use-freenotes.js";

export function Plans({ state, workspace }: { state: FreenotesState; workspace: Workspace }) {
  const open = workspace.todos.filter((t) => !workspace.results.some((r) => r.todoId === t.id && (r.status === "done" || r.status === "skipped")));
  const [selected, setSelected] = useState<string | undefined>(open[0]?.id);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const plan = selected ? workspace.plans[selected] : undefined;
  const todo = workspace.todos.find((t) => t.id === selected);

  return (
    <section>
      <header className="section-head">
        <h2>3 · Execution plans</h2>
        <p>The chief of staff decomposes each todo into execution parameters: objective, first action, steps, definition of done, inputs and risks. You execute.</p>
      </header>
      <div className="row">
        <div className="chips">
          {open.map((t) => (
            <button key={t.id} type="button" className={`chip ${selected === t.id ? "on" : ""} ${workspace.plans[t.id] ? "planned" : ""}`} onClick={() => setSelected(t.id)}>
              <span className="mono">{t.id}</span> {t.title}
            </button>
          ))}
          {open.length === 0 && <span className="muted">Nothing open. Capture a braindump first.</span>}
        </div>
        <button className="secondary" disabled={open.length === 0 || !!state.busy} onClick={() => state.run("Planning everything…", (app) => app.planAll())}>
          Plan all open
        </button>
      </div>

      {todo && (
        <article className="plan">
          <div className="row">
            <h3>
              <span className="mono">{todo.id}</span> {todo.title}
            </h3>
            <button className="primary" disabled={!!state.busy} onClick={() => state.run(`Planning ${todo.id}…`, (app) => app.plan(todo.id))}>
              {plan ? "Re-plan" : "Plan this"}
            </button>
          </div>
          {plan ? (
            <>
              <p>
                <strong>Objective.</strong> {plan.objective}
              </p>
              <p className="callout">
                <strong>Start here →</strong> {plan.firstAction}
              </p>
              <ol className="steps">
                {plan.steps.map((s) => {
                  const key = `${plan.todoId}:${s.order}`;
                  return (
                    <li key={key} className={checked[key] ? "done" : ""}>
                      <label>
                        <input type="checkbox" checked={!!checked[key]} onChange={(e) => setChecked({ ...checked, [key]: e.target.checked })} />
                        <span>
                          <strong>{s.action}</strong>
                          {s.estimatedMinutes ? <span className="muted"> · {formatMinutes(s.estimatedMinutes)}</span> : null}
                          {s.detail && <div className="detail">{s.detail}</div>}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ol>
              <div className="three">
                <div>
                  <h4>Done when</h4>
                  <ul>{plan.definitionOfDone.map((d, i) => <li key={i}>{d}</li>)}</ul>
                </div>
                <div>
                  <h4>Have at hand</h4>
                  <ul>{plan.inputs.map((d, i) => <li key={i}>{d}</li>)}</ul>
                </div>
                <div>
                  <h4>Watch for</h4>
                  <ul>{plan.risks.map((d, i) => <li key={i}>{d}</li>)}</ul>
                </div>
              </div>
              <p className="muted">Prepared by the {plan.source} chief of staff.</p>
            </>
          ) : (
            <p className="muted">No plan yet.</p>
          )}
        </article>
      )}
    </section>
  );
}
