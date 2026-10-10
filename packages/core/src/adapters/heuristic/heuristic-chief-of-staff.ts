import type { ExecutionPlan, ExecutionStep } from "../../execution/execution-plan.js";
import { deadlineInstant } from "../../planning/scheduler.js";
import { WorkingHours } from "../../planning/working-hours.js";
import { PRIORITY_RANK, type Todo } from "../../planning/todo.js";
import type { Achievement, AchievementReport, Improvement, Reflection, Significance } from "../../review/achievement-report.js";
import { orderAchievements } from "../../review/achievement-report.js";
import type {
  ChiefOfStaff,
  ComposeReportRequest,
  PlanExecutionRequest,
  RefineTodosRequest,
  TodoRefinement,
} from "../../ports/chief-of-staff.js";

type WorkKind = "communication" | "writing" | "review" | "admin" | "build" | "research" | "meeting" | "generic";

const KIND_RULES: Array<[RegExp, WorkKind, number]> = [
  [/\b(call|phone|ring|email|e-mail|reply|respond|ping|message|text|follow[- ]?up|chase)\b/i, "communication", 20],
  [/\b(meet|meeting|1:1|one-on-one|sync|standup|interview|workshop|offsite)\b/i, "meeting", 45],
  [/\b(write|draft|blog|post|article|doc|document|memo|proposal|brief|newsletter|essay|spec)\b/i, "writing", 90],
  [/\b(review|read through|proofread|feedback|approve|audit|check)\b/i, "review", 45],
  [/\b(book|buy|order|pay|renew|register|submit|file|schedule|cancel|expense|invoice|sign)\b/i, "admin", 20],
  [/\b(build|implement|code|fix|ship|deploy|design|prototype|deck|presentation|slides|plan|budget|model|analysis|analyse|analyze|migrate|set ?up)\b/i, "build", 120],
  [/\b(research|investigate|explore|read|study|learn|compare|evaluate)\b/i, "research", 60],
];

export function classifyWork(title: string): { kind: WorkKind; minutes: number } {
  for (const [re, kind, minutes] of KIND_RULES) if (re.test(title)) return { kind, minutes };
  return { kind: "generic", minutes: 30 };
}

/**
 * A rule-based chief of staff. Never wrong in a surprising way, never brilliant.
 * It is the default when no model is configured and the oracle for tests.
 */
export class HeuristicChiefOfStaff implements ChiefOfStaff {
  readonly name = "heuristic";

  async refineTodos(request: RefineTodosRequest): Promise<readonly TodoRefinement[]> {
    const refinements: TodoRefinement[] = [];
    for (const todo of request.todos) {
      const r: { estimatedMinutes?: number; priority?: Todo["priority"]; rationale: string[] } = { rationale: [] };
      if (todo.estimateSource === "default") {
        const { kind, minutes } = classifyWork(todo.title);
        if (minutes !== todo.estimatedMinutes) {
          r.estimatedMinutes = minutes;
          r.rationale.push(`Looks like ${kind} work; typical effort ≈ ${minutes} min.`);
        }
      }
      if (todo.deadline && todo.priority === "normal") {
        const due = deadlineInstant(todo.deadline, WorkingHours.default()).getTime();
        const soon = request.context.today.addDays(2).startOfDay().getTime();
        if (due <= soon) {
          r.priority = "high";
          r.rationale.push("Due within two days.");
        }
      }
      if (r.estimatedMinutes !== undefined || r.priority !== undefined) {
        refinements.push({
          todoId: todo.id,
          ...(r.estimatedMinutes !== undefined ? { estimatedMinutes: r.estimatedMinutes } : {}),
          ...(r.priority !== undefined ? { priority: r.priority } : {}),
          rationale: r.rationale.join(" "),
        });
      }
    }
    return refinements;
  }

  async planExecution(request: PlanExecutionRequest): Promise<ExecutionPlan> {
    const { todo } = request;
    const { kind } = classifyWork(todo.title);
    const steps = stepsFor(kind, todo);
    const total = todo.estimatedMinutes;
    const share = distribute(total, steps.length);
    const planned: ExecutionStep[] = steps.map((s, i) => ({ order: i + 1, action: s.action, detail: s.detail, estimatedMinutes: share[i]! }));
    const when = todo.deadline ? ` by ${todo.deadline.date}${todo.deadline.time ? " " + todo.deadline.time : ""}` : "";
    return {
      todoId: todo.id,
      objective: `${todo.title}${when} — finished to a standard you would be comfortable showing someone you respect.`,
      definitionOfDone: definitionOfDone(kind, todo),
      steps: planned,
      inputs: inputsFor(kind),
      risks: risksFor(kind, todo),
      firstAction: planned[0]!.action,
      source: "heuristic",
    };
  }

  async composeAchievementReport(request: ComposeReportRequest): Promise<AchievementReport> {
    const todoById = new Map(request.todos.map((t) => [t.id, t] as const));
    const atRisk = new Set(request.schedule?.warnings.filter((w) => w.kind !== "deadline-passed").map((w) => w.todoId) ?? []);
    const unscheduled = new Set(request.schedule?.unscheduled.map((u) => u.todoId) ?? []);

    const achievements: Achievement[] = [];
    const done: Todo[] = [];
    const partial: Todo[] = [];
    const blocked: Todo[] = [];
    const skipped: Todo[] = [];

    for (const r of request.results) {
      const todo = todoById.get(r.todoId);
      if (!todo) continue;
      if (r.status === "done") {
        done.push(todo);
        achievements.push({
          todoId: todo.id,
          title: todo.title,
          summary: r.notes ? `Completed. ${capitalize(r.notes)}` : "Completed as planned.",
          significance: significanceOf(todo),
          onTime: todo.deadline ? !atRisk.has(todo.id) : null,
        });
      } else if (r.status === "partial") {
        partial.push(todo);
        achievements.push({
          todoId: todo.id,
          title: todo.title,
          summary: r.notes ? `Progressed, not finished. ${capitalize(r.notes)}` : "Progressed, not finished.",
          significance: "minor",
          onTime: todo.deadline ? false : null,
        });
      } else if (r.status === "blocked") blocked.push(todo);
      else skipped.push(todo);
    }

    const reported = new Set(request.results.map((r) => r.todoId));
    const silent = request.todos.filter((t) => !reported.has(t.id));

    const improvements: Improvement[] = [];
    const late = done.filter((t) => t.deadline && atRisk.has(t.id));
    if (late.length || partial.some((t) => t.deadline)) {
      const ids = [...late, ...partial.filter((t) => t.deadline)].map((t) => t.id);
      improvements.push({
        theme: "Estimation",
        observation: `${ids.length} deadline-bound item${ids.length > 1 ? "s" : ""} ran past the schedule, which suggests the estimates were optimistic or the week filled up.`,
        suggestion: "Next braindump, add a duration to every dated item and pad anything you have not done before by 50%.",
        relatedTodoIds: ids,
      });
    }
    if (blocked.length) {
      improvements.push({
        theme: "Dependencies",
        observation: `${blocked.length} item${blocked.length > 1 ? "s were" : " was"} blocked on someone or something else.`,
        suggestion: "Name the dependency in the todo itself (\"… — needs X from Y\") so the schedule can put the ask first and the work after.",
        relatedTodoIds: blocked.map((t) => t.id),
      });
    }
    if (skipped.length) {
      improvements.push({
        theme: "Prioritisation",
        observation: `${skipped.length} item${skipped.length > 1 ? "s were" : " was"} skipped. Skipping is fine when deliberate; the question is whether it was.`,
        suggestion: "Mark low-priority items [low] at capture time so skipping them costs nothing and leaving them out is explicit.",
        relatedTodoIds: skipped.map((t) => t.id),
      });
    }
    if (unscheduled.size) {
      improvements.push({
        theme: "Capacity",
        observation: `${unscheduled.size} item${unscheduled.size > 1 ? "s" : ""} did not fit into the scheduling horizon at all.`,
        suggestion: "Either widen the horizon, shrink the braindump, or delegate; the calendar is telling you the plan is bigger than the week.",
        relatedTodoIds: [...unscheduled],
      });
    }
    if (silent.length) {
      improvements.push({
        theme: "Follow-through",
        observation: `${silent.length} item${silent.length > 1 ? "s have" : " has"} no reported outcome.`,
        suggestion: "Close every loop: a one-word status (done / partial / blocked / skipped) is enough.",
        relatedTodoIds: silent.map((t) => t.id),
      });
    }
    if (improvements.length === 0) {
      improvements.push({
        theme: "Stretch",
        observation: "Everything reported was completed and nothing slipped.",
        suggestion: "The plan may have been comfortable; next cycle, add one item that scares you a little.",
        relatedTodoIds: [],
      });
    }

    const reflections: Reflection[] = done.map((t, i) => ({ todoId: t.id, question: reflectionQuestion(t, i) }));

    const total = request.results.length;
    const headline =
      total === 0
        ? "No results reported yet."
        : `${done.length} of ${total} reported items completed${late.length ? `, ${late.length} past the plan` : ""}${partial.length ? `, ${partial.length} in progress` : ""}.`;

    return { headline, achievements: orderAchievements(achievements), improvements, reflections, source: "heuristic" };
  }
}

/** Priority, effort and a deadline each earn points; the sum decides how much the win counts. */
function significanceOf(todo: Todo): Significance {
  const priorityPoints = 2 - PRIORITY_RANK[todo.priority]; // high 2, normal 1, low 0
  const effortPoints = todo.estimatedMinutes >= 180 ? 2 : todo.estimatedMinutes >= 60 ? 1 : 0;
  const deadlinePoints = todo.deadline ? 1 : 0;
  const score = priorityPoints + effortPoints + deadlinePoints;
  return score >= 3 ? "major" : score >= 2 ? "solid" : "minor";
}

const REFLECTION_TEMPLATES = [
  (t: string) => `What made "${t}" go well, and what would you do differently next time?`,
  (t: string) => `Was "${t}" worth the time it took, and how do you know?`,
  (t: string) => `What did finishing "${t}" unblock, and who should hear about it?`,
  (t: string) => `If you had to do "${t}" again in half the time, what would you cut?`,
  (t: string) => `What did you learn from "${t}" that changes how you will plan next week?`,
];

function reflectionQuestion(todo: Todo, index: number): string {
  return REFLECTION_TEMPLATES[index % REFLECTION_TEMPLATES.length]!(todo.title);
}

function stepsFor(kind: WorkKind, todo: Todo): Array<{ action: string; detail: string }> {
  const t = todo.title;
  switch (kind) {
    case "communication":
      return [
        { action: `Write down the one outcome you want from "${t}" and the single question you need answered.`, detail: "One sentence each. If you cannot, you are not ready to reach out." },
        { action: "Gather context: last message, names, dates, numbers you will be asked about.", detail: "Have it open before you start so the conversation is short." },
        { action: "Make the contact and state the ask in the first two sentences.", detail: "Lead with the ask, then the reason." },
        { action: "Record the outcome and the next step while it is fresh.", detail: "Who owes what by when; put a follow-up todo in the next braindump if needed." },
      ];
    case "meeting":
      return [
        { action: `Write the purpose of "${t}" and the decision or output it must produce.`, detail: "If there is no decision or output, consider cancelling." },
        { action: "Prepare a three-item agenda and send it to attendees.", detail: "Put the hardest item first while energy is high." },
        { action: "Run the meeting against the agenda; capture decisions and owners live.", detail: "End five minutes early to confirm next steps." },
        { action: "Send the notes within an hour.", detail: "Decisions, owners, dates. Nothing else." },
      ];
    case "writing":
      return [
        { action: `Write the one-sentence point of "${t}" and who it is for.`, detail: "Tape it above the document. Everything serves it." },
        { action: "Outline five headings with one bullet each.", detail: "This is the whole argument; if the outline is weak the prose will not save it." },
        { action: "Draft straight through without editing.", detail: "Ugly and complete beats polished and half-done." },
        { action: "Edit once for structure, once for sentences, then stop.", detail: "Read it aloud. Cut anything you stumble on." },
        { action: "Ship it and note where it went.", detail: "Publish, send or hand over; record the link." },
      ];
    case "review":
      return [
        { action: `Decide the standard you are reviewing "${t}" against.`, detail: "Correctness? Clarity? Risk? Write it down so your feedback is consistent." },
        { action: "Read the whole thing once without commenting.", detail: "First pass is for understanding, not judgement." },
        { action: "Second pass: write feedback as specific, actionable items ranked by importance.", detail: "Lead with what blocks approval." },
        { action: "Deliver the review and state clearly: approved, approved with changes, or not yet.", detail: "Ambiguity costs the author a day." },
      ];
    case "admin":
      return [
        { action: `List exactly what you need to complete "${t}" (logins, numbers, documents, card).`, detail: "Admin stalls on a missing detail; collect them all first." },
        { action: "Do it in one sitting, end to end.", detail: "Half-finished admin is worse than untouched admin." },
        { action: "Save the confirmation and note any follow-up date.", detail: "Receipt, reference number, renewal date." },
      ];
    case "research":
      return [
        { action: `Write the question "${t}" must answer and what decision depends on it.`, detail: "Research without a decision attached expands forever." },
        { action: "Time-box the search and collect sources in one place.", detail: "Stop collecting when the next source tells you nothing new." },
        { action: "Write a one-page summary: answer, confidence, open questions.", detail: "If you cannot summarise it, you have not finished." },
        { action: "Make or schedule the decision the research was for.", detail: "Close the loop." },
      ];
    case "build":
      return [
        { action: `Define what "done" looks like for "${t}" in observable terms.`, detail: "A demo, a file, a deployed change, a number on a dashboard." },
        { action: "Break it into the three largest pieces and order them by risk.", detail: "Do the uncertain piece first so surprises arrive early." },
        { action: "Build the first piece to a rough but working state.", detail: "Working beats elegant; you can refine once the shape is right." },
        { action: "Build the remaining pieces, integrating as you go.", detail: "Never leave two unintegrated pieces overnight." },
        { action: "Review against the definition of done, polish, and hand over.", detail: "Then write down what you would do differently." },
      ];
    default:
      return [
        { action: `Clarify what finishing "${t}" produces and for whom.`, detail: "One sentence." },
        { action: "List the inputs and people you need, and get them.", detail: "Blockers found now are cheap." },
        { action: "Do the work in one focused block.", detail: "Phone away, notifications off." },
        { action: "Check the result against the outcome and record it.", detail: "Report done / partial / blocked honestly." },
      ];
  }
}

function definitionOfDone(kind: WorkKind, todo: Todo): string[] {
  const common = [`"${todo.title}" needs no further action from you`, "The outcome is recorded in your results composition"];
  switch (kind) {
    case "communication":
      return ["The other party has the ask and a date", ...common];
    case "writing":
      return ["A reader who skims the headings gets the point", "It is published or sent, not sitting in drafts", ...common];
    case "review":
      return ["The author knows whether it is approved and exactly what to change", ...common];
    case "admin":
      return ["You hold a confirmation or reference number", ...common];
    case "build":
      return ["It works end to end for the main case", "Someone other than you has seen it", ...common];
    case "research":
      return ["The question has a written answer with a confidence level", ...common];
    case "meeting":
      return ["Decisions and owners are written down and sent", ...common];
    default:
      return common;
  }
}

function inputsFor(kind: WorkKind): string[] {
  switch (kind) {
    case "communication":
      return ["Contact details", "Previous correspondence", "The one question you need answered"];
    case "writing":
      return ["Audience and purpose in one sentence", "Source material", "An example of the standard you are aiming for"];
    case "review":
      return ["The artefact to review", "The standard or checklist", "Who to send the verdict to"];
    case "admin":
      return ["Logins and reference numbers", "Payment details if needed", "Deadline and penalty for missing it"];
    case "build":
      return ["Definition of done", "Access to tools and environments", "Someone to demo to"];
    case "research":
      return ["The decision this informs", "Known sources", "A time box"];
    case "meeting":
      return ["Agenda", "Attendee list", "Pre-read if any"];
    default:
      return ["A clear outcome", "Uninterrupted time"];
  }
}

function risksFor(kind: WorkKind, todo: Todo): string[] {
  const risks: string[] = [];
  if (todo.estimateSource === "default") risks.push("The estimate is a default, not yours — check it after the first step and reschedule if it is off.");
  if (todo.deadline) risks.push("There is a deadline; if step one reveals a dependency on someone else, make that ask today.");
  switch (kind) {
    case "communication":
      risks.push("No answer. Decide now what you will do if you hear nothing in 48 hours.");
      break;
    case "writing":
      risks.push("Endless editing. Set a stop time before you start.");
      break;
    case "build":
      risks.push("Scope creep. Anything not in the definition of done goes into the next braindump.");
      break;
    case "research":
      risks.push("Rabbit holes. When the time box ends, write the summary with what you have.");
      break;
    default:
      risks.push("Interruptions. Protect the block on your calendar.");
  }
  return risks;
}

function distribute(total: number, parts: number): number[] {
  const base = Math.floor(total / parts / 5) * 5;
  const out = Array<number>(parts).fill(Math.max(base, 5));
  let remainder = total - out.reduce((a, b) => a + b, 0);
  // Give leftover minutes to the "do the work" steps in the middle, not the bookends.
  for (let i = Math.floor(parts / 2); remainder > 0 && i < parts; i++) {
    const give = Math.min(remainder, 5 * Math.ceil(remainder / 5));
    out[i] = out[i]! + give;
    remainder -= give;
  }
  return out;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
