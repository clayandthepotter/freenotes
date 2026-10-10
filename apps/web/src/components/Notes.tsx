import { useState } from "react";
import { formatDay, formatTime, type Workspace } from "@freenotes/core";
import { Markdown } from "./Markdown.js";

export function Notes({ workspace }: { workspace: Workspace }) {
  const [selected, setSelected] = useState<string | undefined>(workspace.compositions.at(-1)?.id);
  const [filter, setFilter] = useState<string>("");
  const list = [...workspace.compositions].reverse().filter((c) => !filter || c.kind === filter);
  const current = workspace.compositions.find((c) => c.id === selected) ?? list[0];
  const kinds = [...new Set(workspace.compositions.map((c) => c.kind))];

  return (
    <section className="notes">
      <header className="section-head">
        <h2>5 · Notes</h2>
        <p>Every artefact of the loop is a composition you can read like any other note.</p>
      </header>
      <div className="notes-layout">
        <aside>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All kinds</option>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <ul className="note-list">
            {list.map((c) => (
              <li key={c.id} className={current?.id === c.id ? "on" : ""} onClick={() => setSelected(c.id)}>
                <span className={`kind ${c.kind}`}>{c.kind}</span>
                <div>{c.title}</div>
                <small className="muted">
                  {formatDay(c.createdAt)} {formatTime(c.createdAt)}
                </small>
              </li>
            ))}
            {list.length === 0 && <li className="muted">Nothing yet.</li>}
          </ul>
        </aside>
        <article>{current ? <Markdown source={`# ${current.title}\n\n${current.body}`} /> : <p className="muted">Select a note.</p>}</article>
      </div>
    </section>
  );
}
