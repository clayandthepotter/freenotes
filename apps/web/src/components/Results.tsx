import { useState } from "react";
import { formatDeadline, type Workspace } from "@freenotes/core";
import type { FreenotesState } from "../lib/use-freenotes.js";

export function Results({ state, workspace }: { state: FreenotesState; workspace: Workspace }) {
  const [text, setText] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const report = workspace.report;
  const todo = (id: string) => workspace.todos.find((t) => t.id === id);
  const answered = new Map(workspace.reflections.map((r) => [r.todoId, r] as const));

  const placeholder = workspace.todos
    .slice(0, 3)
    .map((t, i) => `${t.id}: ${["done — shipped it", "partial, got halfway", "skipped, no time"][i]}`)
    .join("\n");

  return (
    <section>
      <header className="section-head">
        <h2>4 · Results &amp; achievement report</h2>
        <p>
          Report what happened, one line per todo: <code>T1: done — shipped Thursday</code>, <code>T2 partial …</code>, <code>T3 blocked on …</code>, <code>T4 skipped</code>. The chief of
          staff composes the achievement report, areas to improve, and one reflection question per completed todo.
        </p>
      </header>
      <textarea rows={6} value={text} placeholder={placeholder || "T1: done — …"} onChange={(e) => setText(e.target.value)} />
      <div className="row">
        <span className="muted">{workspace.results.length} result{workspace.results.length === 1 ? "" : "s"} recorded so far</span>
        <button
          className="primary"
          disabled={!text.trim() || !!state.busy}
          onClick={async () => {
            const out = await state.run("Composing achievement report…", (app) => app.report(text));
            if (out) setText("");
          }}
        >
          Submit results
        </button>
      </div>

      {report && (
        <article className="report">
          <blockquote className="headline">{report.headline}</blockquote>
          <h3>Achievements</h3>
          {report.achievements.length === 0 && <p className="muted">Nothing completed yet.</p>}
          <ol className="achievements">
            {report.achievements.map((a) => (
              <li key={a.todoId}>
                <div className="row tight">
                  <strong>{a.title}</strong>
                  <span className="tags">
                    <span className={`pill ${a.significance}`}>{a.significance}</span>
                    {a.onTime !== null && <span className={`pill ${a.onTime ? "ontime" : "late"}`}>{a.onTime ? "on time" : "late"}</span>}
                    {todo(a.todoId)?.deadline && <span className="muted">due {formatDeadline(todo(a.todoId)!)}</span>}
                  </span>
                </div>
                <p>{a.summary}</p>
              </li>
            ))}
          </ol>
          <h3>Areas to improve</h3>
          <ul className="improvements">
            {report.improvements.map((imp, i) => (
              <li key={i}>
                <strong>{imp.theme}.</strong> {imp.observation}
                {imp.relatedTodoIds.length > 0 && <span className="muted"> ({imp.relatedTodoIds.join(", ")})</span>}
                <div className="suggestion">→ {imp.suggestion}</div>
              </li>
            ))}
          </ul>
          <h3>Reflection</h3>
          {report.reflections.length === 0 && <p className="muted">No completed todos to reflect on.</p>}
          <ul className="reflections">
            {report.reflections.map((r) => {
              const done = answered.get(r.todoId);
              return (
                <li key={r.todoId}>
                  <div>
                    <span className="mono">{r.todoId}</span> {r.question}
                  </div>
                  {done ? (
                    <blockquote>{done.answer}</blockquote>
                  ) : (
                    <div className="row">
                      <input placeholder="Your answer…" value={answers[r.todoId] ?? ""} onChange={(e) => setAnswers({ ...answers, [r.todoId]: e.target.value })} />
                      <button className="secondary" disabled={!answers[r.todoId]?.trim() || !!state.busy} onClick={() => state.run("Saving reflection…", (app) => app.reflect(r.todoId, answers[r.todoId]!))}>
                        Save
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="muted">Composed by the {report.source} chief of staff.</p>
        </article>
      )}
    </section>
  );
}
