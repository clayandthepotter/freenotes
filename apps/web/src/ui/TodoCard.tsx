import { formatDeadline, formatMinutes, type ResultStatus, type Todo } from "@freenotes/core";
import { Icon } from "./Icon.js";

export function TodoCard({ todo, status, planned, onClick, trailing }: { todo: Todo; status?: ResultStatus | undefined; planned?: boolean | undefined; onClick?: (() => void) | undefined; trailing?: string | undefined }) {
  return (
    <div className={`todo ${status ?? "open"}`} onClick={onClick} role={onClick ? "button" : undefined}>
      <span className={`status ${status ?? ""}`} aria-label={status ?? "open"}>
        {status === "done" && <Icon name="check" size={14} strokeWidth={3} />}
        {status === "partial" && <Icon name="clock" size={14} strokeWidth={2.5} />}
        {status === "blocked" && <Icon name="x" size={14} strokeWidth={3} />}
      </span>
      <div className="grow">
        <div className="title">{todo.title}</div>
        <div className="meta">
          <span className="mono">{todo.id}</span>
          {todo.priority !== "normal" && <span className={`pill ${todo.priority}`}>{todo.priority}</span>}
          <span>{formatMinutes(todo.estimatedMinutes)}</span>
          {todo.deadline && <span>due {formatDeadline(todo)}</span>}
          {planned && (
            <span className="pill">
              <Icon name="list" size={11} /> plan
            </span>
          )}
          {trailing && <span>{trailing}</span>}
        </div>
      </div>
      {onClick && <Icon name="chevron" size={18} />}
    </div>
  );
}
