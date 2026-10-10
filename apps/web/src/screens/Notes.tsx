import { useState } from "react";
import { formatDay, formatTime, type Composition, type Workspace } from "@freenotes/core";
import { Markdown } from "../components/Markdown.js";
import { Icon } from "../ui/Icon.js";
import { EmptyState } from "../ui/Shell.js";
import type { Route } from "../ui/router.js";

const KIND_ICON: Record<Composition["kind"], string> = { braindump: "capture", schedule: "calendar", "execution-plan": "plan", results: "flag", "achievement-report": "review", note: "notes" };
const KIND_LABEL: Record<Composition["kind"], string> = { braindump: "Braindump", schedule: "Schedule", "execution-plan": "Plan", results: "Results", "achievement-report": "Achievement report", note: "Note" };

export function NotesList({ workspace, navigate }: { workspace: Workspace; navigate: (r: Route) => void }) {
  const [filter, setFilter] = useState<string>("");
  const list = [...workspace.compositions].reverse().filter((c) => !filter || c.kind === filter);
  const kinds = [...new Set(workspace.compositions.map((c) => c.kind))];
  if (workspace.compositions.length === 0) return <EmptyState icon="notes" title="No notes yet" body="Every braindump, schedule, plan and report becomes a note here." />;
  return (
    <div className="stack">
      <div className="chips">
        <button className={`chip ${!filter ? "on" : ""}`} onClick={() => setFilter("")}>
          All
        </button>
        {kinds.map((k) => (
          <button key={k} className={`chip ${filter === k ? "on" : ""}`} onClick={() => setFilter(k)}>
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>
      <div className="todo-list">
        {list.map((c) => (
          <div key={c.id} className="card flat note-item tappable" onClick={() => navigate({ tab: "notes", id: c.id })}>
            <span className="kind">
              <Icon name={KIND_ICON[c.kind]} size={20} />
            </span>
            <div className="grow">
              <div className="truncate" style={{ fontWeight: 600 }}>
                {c.title}
              </div>
              <div className="muted small">
                {KIND_LABEL[c.kind]} · {formatDay(c.createdAt)} {formatTime(c.createdAt)}
              </div>
            </div>
            <Icon name="chevron" size={18} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function NoteDetail({ workspace, id }: { workspace: Workspace; id: string }) {
  const c = workspace.compositions.find((x) => x.id === id);
  if (!c) return <EmptyState icon="notes" title="Note not found" body="It may have been removed." />;
  return (
    <div className="card">
      <p className="muted small">
        {KIND_LABEL[c.kind]} · {formatDay(c.createdAt)} {formatTime(c.createdAt)}
      </p>
      <Markdown source={`# ${c.title}\n\n${c.body}`} />
    </div>
  );
}
