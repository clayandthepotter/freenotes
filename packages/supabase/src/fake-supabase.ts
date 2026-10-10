/**
 * A tiny in-memory stand-in for the parts of supabase-js that the repositories use.
 * Test-only; keeps the adapters honest about the exact query shapes they issue.
 */
export type FakeRow = Record<string, unknown>;

type Result = { data: FakeRow[] | null; error: { code?: string; message: string } | null; count?: number };

export class FakeSupabase {
  readonly tables = new Map<string, FakeRow[]>();
  private seq = 1;

  constructor(readonly uniqueKeys: Record<string, string[]> = { workspaces: ["user_id", "name"], user_settings: ["user_id"] }) {}

  from(table: string) {
    const rows = () => this.tables.get(table) ?? this.tables.set(table, []).get(table)!;
    const unique = this.uniqueKeys[table] ?? [];
    const self = this;

    const build = (mode: "select" | "insert" | "update" | "upsert", payload?: FakeRow, opts: { head?: boolean } = {}) => {
      const filters: Array<[string, unknown]> = [];
      const matches = (r: FakeRow) => filters.every(([k, v]) => r[k] === v);
      const run = (): Result => {
        switch (mode) {
          case "select": {
            const found = rows().filter(matches);
            return { data: opts.head ? null : found, error: null, count: found.length };
          }
          case "insert": {
            if (rows().some((r) => unique.every((k) => r[k] === payload![k]))) return { data: null, error: { code: "23505", message: "duplicate key" } };
            const row = { id: String(self.seq++), ...payload! };
            rows().push(row);
            return { data: [row], error: null };
          }
          case "upsert": {
            const existing = rows().find((r) => unique.every((k) => r[k] === payload![k]));
            if (existing) Object.assign(existing, payload);
            else rows().push({ id: String(self.seq++), ...payload! });
            return { data: [existing ?? payload!], error: null };
          }
          case "update": {
            const updated = rows().filter(matches);
            for (const r of updated) Object.assign(r, payload);
            return { data: updated, error: null };
          }
        }
      };
      const api = {
        eq(k: string, v: unknown) {
          filters.push([k, v]);
          return api;
        },
        select(_cols?: string, o?: { head?: boolean; count?: string }) {
          if (o?.head) opts.head = true;
          return api;
        },
        async maybeSingle() {
          const r = run();
          return { data: r.data?.[0] ?? null, error: r.error };
        },
        async single() {
          const r = run();
          return { data: r.data?.[0] ?? null, error: r.error };
        },
        then<T>(resolve: (v: Result) => T) {
          return Promise.resolve(run()).then(resolve);
        },
      };
      return api;
    };

    return {
      select: (_cols?: string, o?: { head?: boolean; count?: string }) => build("select", undefined, { ...(o?.head ? { head: true } : {}) }),
      insert: (payload: FakeRow) => build("insert", payload),
      update: (payload: FakeRow) => build("update", payload),
      upsert: (payload: FakeRow, _o?: unknown) => build("upsert", payload),
    };
  }
}
