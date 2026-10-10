import type { ExecutionPlan } from "../execution/execution-plan.js";
import type { Schedule, TimeBlock } from "../planning/schedule.js";
import type { Todo, TodoId } from "../planning/todo.js";
import type { AchievementReport, ReflectionAnswer } from "../review/achievement-report.js";
import type { TodoResult } from "../review/result-report.js";
import type { TodoRefinement } from "../ports/chief-of-staff.js";
import { LocalDate } from "../shared/local-date.js";

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

export function formatTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function formatDay(d: Date | LocalDate): string {
  const date = d instanceof LocalDate ? d.startOfDay() : d;
  return `${WEEKDAY[date.getDay()]} ${date.getDate()} ${MONTH[date.getMonth()]}`;
}

export function formatDeadline(todo: Todo): string {
  if (!todo.deadline) return "";
  return `${formatDay(todo.deadline.date)}${todo.deadline.time ? " " + todo.deadline.time : ""}`;
}

const PRIORITY_MARK = { high: "▲ high", normal: "• normal", low: "▽ low" } as const;

export function renderTodos(todos: readonly Todo[], refinements: readonly TodoRefinement[] = []): string {
  if (todos.length === 0) return "_No todos._";
  const byId = new Map(refinements.map((r) => [r.todoId, r] as const));
  const lines = ["| # | Todo | Priority | Estimate | Due |", "|---|------|----------|----------|-----|"];
  for (const t of todos) {
    const r = byId.get(t.id);
    const est = `${formatMinutes(t.estimatedMinutes)}${t.estimateSource === "default" ? " (default)" : t.estimateSource === "assistant" ? " (assistant)" : ""}`;
    lines.push(`| ${t.id} | ${escapeCell(t.title)}${r?.rationale ? ` _(${escapeCell(r.rationale)})_` : ""} | ${PRIORITY_MARK[t.priority]} | ${est} | ${formatDeadline(t) || "—"} |`);
  }
  return lines.join("\n");
}

export function renderSchedule(schedule: Schedule, todos: readonly Todo[]): string {
  const byId = new Map(todos.map((t) => [t.id, t] as const));
  const out: string[] = [];
  out.push(`_Generated ${formatDay(schedule.generatedAt)} ${formatTime(schedule.generatedAt)} · horizon to ${formatDay(schedule.horizon.end)}_`, "");

  if (schedule.blocks.length === 0) out.push("_Nothing to schedule._");

  let currentDay = "";
  for (const b of schedule.blocks) {
    const dayKey = LocalDate.fromDate(b.range.start).toString();
    if (dayKey !== currentDay) {
      currentDay = dayKey;
      out.push(`### ${formatDay(b.range.start)}`, "");
    }
    out.push(`- **${formatTime(b.range.start)}–${formatTime(b.range.end)}** ${label(b, byId)}`);
  }

  if (schedule.warnings.length) {
    out.push("", "### ⚠ Watch-outs", "");
    for (const w of schedule.warnings) {
      const title = byId.get(w.todoId)?.title ?? w.todoId;
      if (w.kind === "deadline-passed") out.push(`- **${w.todoId}** ${escapeCell(title)}: deadline already passed (${formatDay(w.deadlineAt)} ${formatTime(w.deadlineAt)}).`);
      else out.push(`- **${w.todoId}** ${escapeCell(title)}: due ${formatDay(w.deadlineAt)} ${formatTime(w.deadlineAt)} but the plan finishes ${formatDay(w.finishesAt)} ${formatTime(w.finishesAt)}. Renegotiate the deadline, shrink the scope, or drop something else.`);
    }
  }
  if (schedule.unscheduled.length) {
    out.push("", "### Did not fit", "");
    for (const u of schedule.unscheduled) {
      out.push(`- **${u.todoId}** ${escapeCell(byId.get(u.todoId)?.title ?? "")}: ${formatMinutes(u.remainingMinutes)} left over with no capacity in the horizon.`);
    }
  }
  return out.join("\n");
}

function label(b: TimeBlock, byId: Map<TodoId, Todo>): string {
  const t = byId.get(b.todoId);
  const part = b.part.of > 1 ? ` _(part ${b.part.index}/${b.part.of})_` : "";
  return `${b.todoId} ${t ? escapeCell(t.title) : ""}${part}`;
}

export function renderExecutionPlan(plan: ExecutionPlan, todo: Todo): string {
  const out: string[] = [];
  out.push(`## ${todo.id} · ${todo.title}`, "");
  out.push(`**Objective.** ${plan.objective}`, "");
  out.push(`**Start here →** ${plan.firstAction}`, "");
  out.push("### Steps", "");
  for (const s of plan.steps) {
    const est = s.estimatedMinutes ? ` _(${formatMinutes(s.estimatedMinutes)})_` : "";
    out.push(`${s.order}. **${s.action}**${est}${s.detail ? `  \n   ${s.detail}` : ""}`);
  }
  out.push("", "### Done when", "", ...plan.definitionOfDone.map((d) => `- [ ] ${d}`));
  if (plan.inputs.length) out.push("", "### Have at hand", "", ...plan.inputs.map((i) => `- ${i}`));
  if (plan.risks.length) out.push("", "### Watch for", "", ...plan.risks.map((r) => `- ${r}`));
  out.push("", `_Prepared by the ${plan.source} chief of staff._`);
  return out.join("\n");
}

export function renderResults(results: readonly TodoResult[], todos: readonly Todo[], unmatched: readonly string[] = []): string {
  const byId = new Map(todos.map((t) => [t.id, t] as const));
  const mark = { done: "✅", partial: "🟡", blocked: "🔴", skipped: "⏭" } as const;
  const out = results.map((r) => `- ${mark[r.status]} **${r.todoId}** ${escapeCell(byId.get(r.todoId)?.title ?? "")} — ${r.status}${r.notes ? `: ${r.notes}` : ""}`);
  if (unmatched.length) out.push("", "_Could not match to a todo:_", ...unmatched.map((l) => `> ${l.trim()}`));
  return out.join("\n") || "_No results._";
}

export function renderAchievementReport(report: AchievementReport, todos: readonly Todo[], answers: readonly ReflectionAnswer[] = []): string {
  const byId = new Map(todos.map((t) => [t.id, t] as const));
  const answered = new Map(answers.map((a) => [a.todoId, a] as const));
  const out: string[] = [];
  out.push(`> ${report.headline}`, "");
  out.push("## Achievements", "");
  if (report.achievements.length === 0) out.push("_Nothing completed yet._");
  report.achievements.forEach((a, i) => {
    const onTime = a.onTime === null ? "" : a.onTime ? " · on time" : " · late";
    const due = byId.get(a.todoId)?.deadline ? ` · due ${formatDeadline(byId.get(a.todoId)!)}` : "";
    out.push(`${i + 1}. **${escapeCell(a.title)}** _(${a.significance}${onTime}${due})_  \n   ${a.summary}`);
  });
  out.push("", "## Areas to improve", "");
  for (const imp of report.improvements) {
    const rel = imp.relatedTodoIds.length ? ` _(${imp.relatedTodoIds.join(", ")})_` : "";
    out.push(`- **${imp.theme}.** ${imp.observation}${rel}  \n  → ${imp.suggestion}`);
  }
  out.push("", "## Reflection", "");
  if (report.reflections.length === 0) out.push("_No completed todos to reflect on._");
  for (const r of report.reflections) {
    const a = answered.get(r.todoId);
    out.push(`- **${r.todoId}** ${r.question}`);
    out.push(a ? `  > ${a.answer}` : `  > _unanswered — \`freenotes reflect ${r.todoId} "…"\`_`);
  }
  out.push("", `_Composed by the ${report.source} chief of staff._`);
  return out.join("\n");
}

function escapeCell(s: string): string {
  return s.replace(/\|/g, "\\|");
}
