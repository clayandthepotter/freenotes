import type { ChiefOfStaff } from "../ports/chief-of-staff.js";
import type { WorkspaceRepository } from "../ports/workspace-repository.js";
import { systemClock, type Clock } from "../shared/clock.js";
import { randomIdGenerator, type IdGenerator } from "../shared/ids.js";
import type { TodoId } from "../planning/todo.js";
import type { Workspace } from "../workspace/workspace.js";
import {
  answerReflection,
  captureBraindump,
  composeAchievementReport,
  planExecution,
  recordResults,
  scheduleWorkspace,
  type BuildScheduleInput,
  type CaptureBraindumpInput,
  type UseCaseDeps,
} from "./use-cases.js";

export interface FreenotesOptions {
  readonly repository: WorkspaceRepository;
  readonly chiefOfStaff: ChiefOfStaff;
  readonly clock?: Clock;
  readonly ids?: IdGenerator;
  readonly profile?: string;
}

/**
 * The application facade: loads the workspace, runs a use case, saves, returns the output.
 * Apps (CLI, web, server) talk to this and nothing deeper.
 */
export class Freenotes {
  private readonly deps: UseCaseDeps;

  constructor(private readonly options: FreenotesOptions) {
    this.deps = {
      clock: options.clock ?? systemClock,
      ids: options.ids ?? randomIdGenerator,
      chiefOfStaff: options.chiefOfStaff,
      ...(options.profile ? { profile: options.profile } : {}),
    };
  }

  get assistantName(): string {
    return this.options.chiefOfStaff.name;
  }

  workspace(): Promise<Workspace> {
    return this.options.repository.load();
  }

  async braindump(input: CaptureBraindumpInput) {
    const ws = await this.options.repository.load();
    const out = await captureBraindump(ws, input, this.deps);
    await this.options.repository.save(out.workspace);
    return out;
  }

  async schedule(input: BuildScheduleInput = {}) {
    const ws = await this.options.repository.load();
    const out = scheduleWorkspace(ws, input, this.deps);
    await this.options.repository.save(out.workspace);
    return out;
  }

  async plan(todoId: TodoId) {
    const ws = await this.options.repository.load();
    const out = await planExecution(ws, todoId, this.deps);
    await this.options.repository.save(out.workspace);
    return out;
  }

  async planAll() {
    let ws = await this.options.repository.load();
    const plans = [];
    for (const todo of ws.todos) {
      if (ws.results.some((r) => r.todoId === todo.id && (r.status === "done" || r.status === "skipped"))) continue;
      const out = await planExecution(ws, todo.id, this.deps);
      ws = out.workspace;
      plans.push(out);
    }
    await this.options.repository.save(ws);
    return plans;
  }

  /** Record results and compose the achievement report in one go. */
  async report(text: string) {
    const ws = await this.options.repository.load();
    const recorded = recordResults(ws, text, this.deps);
    const composed = await composeAchievementReport(recorded.workspace, this.deps);
    await this.options.repository.save(composed.workspace);
    return { ...composed, results: recorded.results, unmatchedLines: recorded.unmatchedLines };
  }

  /** Record results only (e.g. a one-tap status from a todo card); compose the report later. */
  async record(text: string) {
    const ws = await this.options.repository.load();
    const out = recordResults(ws, text, this.deps);
    await this.options.repository.save(out.workspace);
    return out;
  }

  /** Record one todo's outcome without writing a results composition line by hand. */
  recordOne(todoId: TodoId, status: "done" | "partial" | "blocked" | "skipped", notes = "") {
    return this.record(`${todoId}: ${status}${notes.trim() ? ` — ${notes.trim()}` : ""}`);
  }

  /** Compose (or re-compose) the achievement report from everything recorded so far. */
  async compose() {
    const ws = await this.options.repository.load();
    const out = await composeAchievementReport(ws, this.deps);
    await this.options.repository.save(out.workspace);
    return out;
  }

  async reflect(todoId: TodoId, answer: string) {
    const ws = await this.options.repository.load();
    const out = answerReflection(ws, todoId, answer, this.deps);
    await this.options.repository.save(out.workspace);
    return out;
  }

  async updateSettings(update: (settings: Workspace["settings"]) => Workspace["settings"]) {
    const ws = await this.options.repository.load();
    const next = { ...ws, settings: update(ws.settings) };
    await this.options.repository.save(next);
    return next;
  }
}
