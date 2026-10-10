import { formatDay, formatMinutes, formatTime, LocalDate, type StyleDimension, type Workspace } from "@freenotes/core";

/** "Good morning, Clay." — the name is optional and already trimmed by the caller. */
export function greeting(now: Date, name?: string): string {
  const h = now.getHours();
  const part = h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  return `${part}${name ? `, ${name}` : ""}.`;
}

/** A display name from an email address: "clayton.prickett@x.com" → "Clayton". */
export function nameFromEmail(email: string | undefined): string | undefined {
  if (!email) return undefined;
  const local = email.split("@")[0] ?? "";
  const first = local.split(/[._-]/)[0] ?? "";
  return first ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() : undefined;
}

export interface BriefStats {
  readonly blocksToday: number;
  readonly minutesToday: number;
  readonly atRisk: number;
  readonly nextDayWithWork?: Date;
}

export function briefStats(ws: Workspace, now: Date): BriefStats {
  const today = LocalDate.fromDate(now).toString();
  const blocks = ws.schedule?.blocks ?? [];
  const todays = blocks.filter((b) => LocalDate.fromDate(b.range.start).toString() === today);
  const future = blocks.filter((b) => b.range.start.getTime() > now.getTime() && LocalDate.fromDate(b.range.start).toString() !== today);
  const nextDay = future.sort((a, b) => a.range.start.getTime() - b.range.start.getTime())[0]?.range.start;
  return {
    blocksToday: todays.length,
    minutesToday: todays.reduce((s, b) => s + b.range.durationMinutes, 0),
    atRisk: ws.schedule?.warnings.length ?? 0,
    ...(nextDay ? { nextDayWithWork: nextDay } : {}),
  };
}

/** The one-line read on the day under the greeting. Written like a person, not a dashboard. */
export function summaryLine(ws: Workspace, now: Date): string {
  const open = ws.todos.filter((t) => !ws.results.some((r) => r.todoId === t.id && (r.status === "done" || r.status === "skipped")));
  if (ws.todos.length === 0) return "Nothing captured yet. Braindump what's on your mind.";
  if (!ws.schedule) return `${open.length} thing${open.length === 1 ? "" : "s"} waiting to be placed on the calendar.`;
  const s = briefStats(ws, now);
  const risk = s.atRisk === 0 ? "" : s.atRisk === 1 ? " One deadline at risk." : ` ${s.atRisk} deadlines at risk.`;
  if (s.blocksToday === 0) {
    if (open.length === 0) return "Everything is done. Enjoy the clear day.";
    return `Clear today.${s.nextDayWithWork ? ` Next focus block ${formatDay(s.nextDayWithWork)}.` : ""}${risk}`;
  }
  const light = s.minutesToday <= 120 ? "Light day." : s.minutesToday >= 360 ? "Full day." : "";
  return `${s.blocksToday} focus block${s.blocksToday === 1 ? "" : "s"} today, ${formatMinutes(s.minutesToday)} planned.${light ? ` ${light}` : ""}${risk}`;
}

export type AttentionKind = "now" | "next" | "overdue" | "risk" | "unrecorded" | "unplanned" | "review" | "capture";

export interface AttentionItem {
  readonly kind: AttentionKind;
  readonly title: string;
  readonly detail: string;
  readonly todoId?: string;
}

/**
 * Which kinds each working style wants to see first. Everything else keeps its natural order
 * ("now" always leads: whatever the style, the block that is running is the block that is running).
 */
const LEADS: Record<StyleDimension, readonly AttentionKind[]> = {
  triage: ["now", "overdue", "risk", "next"],
  capture: ["now", "unrecorded", "unplanned", "capture"],
  improve: ["now", "review", "unrecorded"],
  align: ["now", "risk", "next"],
};

/**
 * What needs attention right now, ranked. Deterministic so it is instant and works offline;
 * the model-backed chief of staff shapes plans and reports, not this triage. The executive's
 * working style decides which kinds lead; within a kind the natural order is kept.
 */
export function attention(ws: Workspace, now: Date): AttentionItem[] {
  const items = rawAttention(ws, now);
  const style = ws.profile.style?.primary;
  if (!style) return items;
  const leads = LEADS[style];
  const rank = (k: AttentionKind) => {
    const i = leads.indexOf(k);
    return i === -1 ? leads.length : i;
  };
  return items.map((item, i) => ({ item, i })).sort((a, b) => rank(a.item.kind) - rank(b.item.kind) || a.i - b.i).map((x) => x.item);
}

function rawAttention(ws: Workspace, now: Date): AttentionItem[] {
  const items: AttentionItem[] = [];
  const todo = (id: string) => ws.todos.find((t) => t.id === id);
  const status = (id: string) => ws.results.find((r) => r.todoId === id)?.status;
  const closed = (id: string) => ["done", "skipped"].includes(status(id) ?? "");
  const t = now.getTime();
  const blocks = ws.schedule?.blocks ?? [];

  const current = blocks.find((b) => b.range.start.getTime() <= t && t < b.range.end.getTime() && !closed(b.todoId));
  if (current) {
    items.push({ kind: "now", todoId: current.todoId, title: todo(current.todoId)?.title ?? current.todoId, detail: `In progress until ${formatTime(current.range.end)}. ${ws.plans[current.todoId] ? "Open the plan and work the next step." : "No plan yet; ask for one."}` });
  }

  for (const w of ws.schedule?.warnings ?? []) {
    if (closed(w.todoId)) continue;
    items.push(
      w.kind === "deadline-passed"
        ? { kind: "overdue", todoId: w.todoId, title: todo(w.todoId)?.title ?? w.todoId, detail: "The deadline has passed. Deliver, renegotiate, or record it as skipped." }
        : { kind: "risk", todoId: w.todoId, title: todo(w.todoId)?.title ?? w.todoId, detail: `Due ${formatDay(w.deadlineAt)} ${formatTime(w.deadlineAt)}, planned to finish ${formatDay(w.finishesAt)}. Cut scope or move something.` },
    );
  }

  const next = blocks.filter((b) => b.range.start.getTime() > t && !closed(b.todoId)).sort((a, b) => a.range.start.getTime() - b.range.start.getTime())[0];
  if (next && !current && !items.some((i) => i.todoId === next.todoId)) {
    items.push({ kind: "next", todoId: next.todoId, title: todo(next.todoId)?.title ?? next.todoId, detail: `Up next at ${formatTime(next.range.start)} on ${formatDay(next.range.start)}.` });
  }

  const pastUnrecorded = new Set(blocks.filter((b) => b.range.end.getTime() < t && !status(b.todoId)).map((b) => b.todoId));
  for (const id of pastUnrecorded) items.push({ kind: "unrecorded", todoId: id, title: todo(id)?.title ?? id, detail: "Its time block has passed. Record what happened so your report stays honest." });

  const unplanned = ws.todos.filter((x) => !closed(x.id) && !ws.plans[x.id]);
  if (unplanned.length > 0) items.push({ kind: "unplanned", title: `${unplanned.length} todo${unplanned.length === 1 ? "" : "s"} without a plan`, detail: "A first action and steps make starting cheap. Plan them now.", ...(unplanned.length === 1 ? { todoId: unplanned[0]!.id } : {}) });

  if (ws.results.length > 0 && !ws.report) items.push({ kind: "review", title: "Outcomes recorded, no report yet", detail: "Compose the achievement report to see what to improve and answer reflections." });
  if (ws.todos.length === 0) items.push({ kind: "capture", title: "Nothing captured", detail: "Braindump what you must do; the schedule and plans follow." });
  else if (ws.todos.every((x) => closed(x.id))) items.push({ kind: "capture", title: "All clear", detail: "Everything is done or skipped. Capture what's next." });

  return items;
}
