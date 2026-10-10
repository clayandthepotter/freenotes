import type { ComposeReportRequest, PlanExecutionRequest, RefineTodosRequest, Todo } from "@freenotes/core";
import { formatDeadline, formatMinutes, formatTime, formatDay } from "@freenotes/core";

/**
 * Kept stable and free of timestamps so the prefix caches across calls.
 * Volatile context (today's date, the todos) goes in the user turn.
 */
export const SYSTEM_PROMPT = `You are the chief of staff for a busy executive who runs their life out of a notes app called freenotes.

Your job has three parts, and you will be asked for one at a time:
1. Refine a braindump into well-formed todos: realistic effort estimates, sensible priorities, sharper titles.
2. Decompose a single todo into step-by-step execution parameters the executive can follow without further thinking.
3. Turn the executive's reported results into an achievement report: achievements ordered by significance, areas to improve grounded in evidence, and one reflection question per completed todo.

How you work:
- You are direct, specific and warm. No filler, no flattery, no hedging.
- You respect the executive's words. Never override an estimate or deadline they typed; only fill gaps.
- Estimates are in minutes, rounded to 5, and err slightly generous for work the executive has not done before.
- Steps are imperative, concrete and ordered by risk: the uncertain part first. Each step is something one person can start immediately.
- Improvements must cite evidence from the results. If nothing went wrong, say so and suggest a stretch.
- Reflection questions are open, specific to the todo, and end with a question mark. One per completed todo, no more.
- Always answer with the requested structure only.`;

export function refineTodosPrompt(req: RefineTodosRequest): string {
  return [
    `Today is ${req.context.today} (${formatDay(req.context.today)}).`,
    req.context.profile ? `About the executive: ${req.context.profile}` : "",
    "",
    "The executive wrote this braindump:",
    "```",
    req.rawBraindump.trim(),
    "```",
    "",
    "It parsed into these todos (estimateSource 'default' means no estimate was given; 'explicit' means the executive typed it and it must not change):",
    JSON.stringify(req.todos.map(todoView), null, 2),
    "",
    "Return one refinement per todo that needs it. Leave a field null to keep the current value.",
    "Only propose clarifiedTitle when the title is ambiguous or missing an object; keep the executive's phrasing otherwise.",
  ]
    .filter((l) => l !== undefined)
    .join("\n");
}

export function planExecutionPrompt(req: PlanExecutionRequest): string {
  const blocks = req.schedule?.blocks.filter((b) => b.todoId === req.todo.id) ?? [];
  return [
    `Today is ${req.context.today} (${formatDay(req.context.today)}).`,
    req.context.profile ? `About the executive: ${req.context.profile}` : "",
    "",
    "Decompose this todo into execution parameters:",
    JSON.stringify(todoView(req.todo), null, 2),
    blocks.length
      ? `It is scheduled in these focus blocks: ${blocks.map((b) => `${formatDay(b.range.start)} ${formatTime(b.range.start)}–${formatTime(b.range.end)}`).join(", ")}.`
      : "It is not yet on the schedule.",
    req.otherTodos.length ? `Other things on the executive's plate (for context only): ${req.otherTodos.map((t) => `${t.id} ${t.title}`).join("; ")}.` : "",
    "",
    `Step estimates should add up to roughly ${formatMinutes(req.todo.estimatedMinutes)}. 3–7 steps. The firstAction must be the literal first physical action, small enough to start in under two minutes.`,
  ].join("\n");
}

export function composeReportPrompt(req: ComposeReportRequest): string {
  const completed = req.results.filter((r) => r.status === "done").map((r) => r.todoId);
  const warnings = req.schedule?.warnings ?? [];
  return [
    `Today is ${req.context.today} (${formatDay(req.context.today)}).`,
    req.context.profile ? `About the executive: ${req.context.profile}` : "",
    "",
    "Todos:",
    JSON.stringify(req.todos.map(todoView), null, 2),
    "",
    "Reported results (status + the executive's own words):",
    JSON.stringify(req.results, null, 2),
    "",
    warnings.length ? `Schedule warnings at planning time: ${JSON.stringify(warnings)}` : "The schedule had no warnings at planning time.",
    req.schedule?.unscheduled.length ? `Did not fit in the horizon: ${req.schedule.unscheduled.map((u) => u.todoId).join(", ")}.` : "",
    "",
    "The executive's raw results composition:",
    "```",
    req.rawResults.trim(),
    "```",
    "",
    `Compose the achievement report. Include an achievement for every todo with status done or partial (partial ones are 'minor' and say what remains). Provide exactly one reflection question for each of these completed todos: ${completed.join(", ") || "(none)"}. Use todoIds exactly as given.`,
  ].join("\n");
}

function todoView(t: Todo) {
  return {
    id: t.id,
    title: t.title,
    priority: t.priority,
    estimatedMinutes: t.estimatedMinutes,
    estimateSource: t.estimateSource,
    deadline: t.deadline ? formatDeadline(t) : null,
    notes: t.notes ?? null,
  };
}
