import { useState } from "react";
import { formatDeadline, type Todo, type Workspace } from "@freenotes/core";
import type { FreenotesState } from "../lib/use-freenotes.js";
import { Icon } from "../ui/Icon.js";
import { EmptyState } from "../ui/Shell.js";
import { StatusSheet } from "../ui/StatusSheet.js";
import { TodoCard } from "../ui/TodoCard.js";
import type { Route } from "../ui/router.js";

export function Review({ state, workspace, navigate }: { state: FreenotesState; workspace: Workspace; navigate: (r: Route) => void }) {
  const [picked, setPicked] = useState<Todo>();
  const [pasteOpen, setPasteOpen] = useState(false);
  const [text, setText] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const report = workspace.report;
  const statusOf = (id: string) => workspace.results.find((r) => r.todoId === id)?.status;
  const answered = new Map(workspace.reflections.map((r) => [r.todoId, r] as const));
  const todo = (id: string) => workspace.todos.find((t) => t.id === id);
  const recorded = workspace.results.length;
  const unrecorded = workspace.todos.filter((t) => !statusOf(t.id));

  if (workspace.todos.length === 0) {
    return <EmptyState icon="review" title="Nothing to review" body="Once you have captured and done some work, record outcomes here and get your achievement report." action={<button className="btn primary" onClick={() => navigate({ tab: "capture" })}>Capture</button>} />;
  }

  return (
    <div className="stack-lg">
      <div className="stack">
        <div className="section-title">
          <h2>Outcomes</h2>
          <span className="muted small">
            {recorded}/{workspace.todos.length} recorded
          </span>
        </div>
        <div className="todo-list">
          {[...unrecorded, ...workspace.todos.filter((t) => statusOf(t.id))].map((t) => (
            <TodoCard key={t.id} todo={t} status={statusOf(t.id)} onClick={() => setPicked(t)} />
          ))}
        </div>
        <button className="link small" onClick={() => setPasteOpen((o) => !o)}>
          {pasteOpen ? "Hide" : "Or paste a results note"}
        </button>
        {pasteOpen && (
          <div className="stack">
            <textarea className="mono-input" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={"T1: done — shipped Thursday\nT2 partial, got halfway\nT3 blocked on legal"} />
            <button className="btn outline" disabled={!text.trim() || !!state.busy} onClick={async () => (await state.run("Recording…", (app) => app.record(text))) && setText("")}>
              Record these
            </button>
          </div>
        )}
      </div>

      <div className="sticky-action">
        <button className="btn primary block" disabled={recorded === 0 || !!state.busy} onClick={() => state.run("Composing your achievement report…", (app) => app.compose())}>
          <Icon name="sparkle" size={18} /> {report ? "Recompose achievement report" : "Compose achievement report"}
        </button>
      </div>

      {report && (
        <div className="stack-lg">
          <div className="card accent">
            <p className="headline">{report.headline}</p>
          </div>
          <div className="stack">
            <div className="section-title">
              <h2>Achievements</h2>
            </div>
            {report.achievements.length === 0 && <p className="muted">Nothing completed yet.</p>}
            {report.achievements.map((a, i) => (
              <div key={a.todoId} className="card achievement">
                <span className="rank">{i + 1}</span>
                <div className="grow">
                  <div className="row between wrap">
                    <strong>{a.title}</strong>
                    <span className="row" style={{ gap: 6 }}>
                      <span className={`pill ${a.significance}`}>{a.significance}</span>
                      {a.onTime !== null && <span className={`pill ${a.onTime ? "ontime" : "late"}`}>{a.onTime ? "on time" : "late"}</span>}
                    </span>
                  </div>
                  <p className="small" style={{ marginTop: 4 }}>{a.summary}</p>
                  {todo(a.todoId)?.deadline && <p className="muted small">due {formatDeadline(todo(a.todoId)!)}</p>}
                </div>
              </div>
            ))}
          </div>
          <div className="stack">
            <div className="section-title">
              <h2>Areas to improve</h2>
            </div>
            {report.improvements.map((imp, i) => (
              <div key={i} className="card flat improvement">
                <div className="theme">{imp.theme}</div>
                <p className="small" style={{ marginTop: 4 }}>
                  {imp.observation}
                  {imp.relatedTodoIds.length > 0 && <span className="muted"> ({imp.relatedTodoIds.join(", ")})</span>}
                </p>
                <div className="suggest">{imp.suggestion}</div>
              </div>
            ))}
          </div>
          <div className="stack">
            <div className="section-title">
              <h2>Reflection</h2>
              <span className="muted small">
                {answered.size}/{report.reflections.length}
              </span>
            </div>
            {report.reflections.length === 0 && <p className="muted">No completed todos to reflect on.</p>}
            {report.reflections.map((r) => {
              const a = answered.get(r.todoId);
              return (
                <div key={r.todoId} className="card reflection">
                  <span className="mono">{r.todoId}</span>
                  <q>{r.question}</q>
                  {a ? (
                    <div className="answer">{a.answer}</div>
                  ) : (
                    <div className="stack" style={{ marginTop: 10 }}>
                      <textarea rows={2} placeholder="Your answer…" value={answers[r.todoId] ?? ""} onChange={(e) => setAnswers({ ...answers, [r.todoId]: e.target.value })} />
                      <button className="btn outline sm" style={{ alignSelf: "flex-end" }} disabled={!answers[r.todoId]?.trim() || !!state.busy} onClick={() => state.run("Saving…", (app) => app.reflect(r.todoId, answers[r.todoId]!))}>
                        Save answer
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="muted small" style={{ textAlign: "center" }}>Composed by the {report.source} chief of staff.</p>
        </div>
      )}

      <StatusSheet todo={picked} state={state} onClose={() => setPicked(undefined)} onOpenPlan={(id) => navigate({ tab: "plan", id })} />
    </div>
  );
}
