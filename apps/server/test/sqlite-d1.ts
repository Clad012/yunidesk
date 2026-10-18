// A real SQLite database (node:sqlite) behind the slice of the D1 API the report queries use,
// so tests run the actual migrations and SQL instead of mocks.
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

const MIGRATIONS = new URL("../migrations/", import.meta.url);

class Statement {
  constructor(
    private readonly db: DatabaseSync,
    readonly sql: string,
    private readonly values: SQLInputValue[] = [],
  ) {}

  bind(...values: unknown[]): Statement {
    return new Statement(this.db, this.sql, values as SQLInputValue[]);
  }

  async all<T>(): Promise<{ results: T[]; success: true; meta: Record<string, unknown> }> {
    return { results: this.db.prepare(this.sql).all(...this.values) as T[], success: true, meta: {} };
  }

  async first<T>(): Promise<T | null> {
    return (this.db.prepare(this.sql).get(...this.values) as T | undefined) ?? null;
  }

  async run(): Promise<{ success: true; meta: { changes: number } }> {
    const result = this.db.prepare(this.sql).run(...this.values);
    return { success: true, meta: { changes: Number(result.changes) } };
  }
}

export interface TestDb {
  sqlite: DatabaseSync;
  d1: D1Database;
  /** Applies the migrations numbered up to `last` that haven't run yet. */
  migrate(last?: number): void;
}

export function createTestDb(): TestDb {
  const sqlite = new DatabaseSync(":memory:");
  let applied = 0;
  const d1 = {
    prepare: (sql: string) => new Statement(sqlite, sql),
    batch: async (statements: Statement[]) => {
      const out = [];
      for (const statement of statements) out.push(await statement.all());
      return out;
    },
  } as unknown as D1Database;
  return {
    sqlite,
    d1,
    migrate(last = Number.POSITIVE_INFINITY) {
      for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
        const number = Number(file.slice(0, 4));
        if (number <= applied || number > last) continue;
        sqlite.exec(readFileSync(new URL(file, MIGRATIONS), "utf8"));
        applied = number;
      }
    },
  };
}
