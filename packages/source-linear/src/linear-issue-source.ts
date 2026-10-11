import { DomainError, LocalDate, type ExternalIssue, type IssueSource } from "@freenotes/core";

export interface LinearIssueSourceOptions {
  /** A personal API key (Linear → Settings → Security & access → Personal API keys). */
  readonly apiKey: string;
  readonly fetch?: typeof fetch;
  readonly endpoint?: string;
  /** Closed issues updated within this many days are still returned so their todos can be closed. */
  readonly closedWithinDays?: number;
  readonly now?: () => Date;
}

const QUERY = `query AssignedToMe($filter: IssueFilter) {
  viewer {
    name
    assignedIssues(first: 200, filter: $filter, orderBy: updatedAt) {
      nodes { id identifier title url dueDate estimate priority state { type } project { name } }
    }
  }
}`;

interface Node {
  id: string;
  identifier: string;
  title: string;
  url: string;
  dueDate: string | null;
  estimate: number | null;
  priority: number;
  state: { type: string };
  project: { name: string } | null;
}

/** Linear's GraphQL API as an IssueSource. Reads only; nothing is written to Linear. */
export class LinearIssueSource implements IssueSource {
  readonly name = "linear";
  private readonly fetchImpl: typeof fetch;
  private readonly endpoint: string;

  constructor(private readonly options: LinearIssueSourceOptions) {
    if (!options.apiKey.trim()) throw new DomainError("linear-config", "A Linear API key is required.");
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.endpoint = options.endpoint ?? "https://api.linear.app/graphql";
  }

  async assignedToMe(): Promise<readonly ExternalIssue[]> {
    const now = this.options.now?.() ?? new Date();
    const since = new Date(now.getTime() - (this.options.closedWithinDays ?? 30) * 86_400_000).toISOString();
    const filter = { or: [{ state: { type: { nin: ["completed", "canceled"] } } }, { updatedAt: { gt: since } }] };
    let res: Response;
    try {
      res = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: this.options.apiKey.trim() },
        body: JSON.stringify({ query: QUERY, variables: { filter } }),
      });
    } catch (e) {
      throw new DomainError("linear-unreachable", `Could not reach Linear: ${(e as Error).message}`);
    }
    if (res.status === 401 || res.status === 403) throw new DomainError("linear-auth", "Linear rejected the API key. Create a personal API key in Linear → Settings → Security & access.");
    if (!res.ok) throw new DomainError("linear-failed", `Linear answered ${res.status}.`);
    const body = (await res.json()) as { data?: { viewer?: { assignedIssues?: { nodes: Node[] } } }; errors?: Array<{ message: string }> };
    if (body.errors?.length) throw new DomainError("linear-failed", `Linear: ${body.errors.map((e) => e.message).join("; ")}`);
    const nodes = body.data?.viewer?.assignedIssues?.nodes ?? [];
    return nodes.map(toIssue);
  }
}

function toIssue(n: Node): ExternalIssue {
  const state = n.state.type === "started" ? "in-progress" : n.state.type === "completed" ? "done" : n.state.type === "canceled" ? "cancelled" : "todo";
  const priority = [0, 1, 2, 3, 4].includes(n.priority) ? (n.priority as ExternalIssue["priority"]) : 0;
  return {
    source: "linear",
    id: n.id,
    identifier: n.identifier,
    title: n.title,
    url: n.url,
    state,
    priority,
    ...(n.dueDate ? { dueDate: LocalDate.parse(n.dueDate) } : {}),
    ...(n.estimate ? { estimatePoints: n.estimate } : {}),
    ...(n.project?.name ? { project: n.project.name } : {}),
  };
}
