export type SqlValue = string | number | null | Uint8Array;

export interface RunResult {
  changes: number;
  lastInsertRowid: number;
}

export interface DbAdapter {
  run(sql: string, params?: SqlValue[]): Promise<RunResult>;
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  get<T>(sql: string, params?: SqlValue[]): Promise<T | null>;
  exec(sql: string): Promise<void>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}

/**
 * Creates a DbAdapter wrapping bun:sqlite's synchronous Database.
 *
 * bun:sqlite API uses prepared statements: db.query(sql).all(...params)
 * db.run(sql) exists for simple commands (no result set).
 */
export function createBunAdapter(db: {
  query(sql: string): {
    run(...params: any[]): { changes: number; lastInsertRowid: number | bigint };
    all(...params: any[]): any[];
    get(...params: any[]): any;
  };
  run(sql: string, ...params: any[]): { changes: number; lastInsertRowid: number | bigint };
  transaction<T>(fn: (...args: any[]) => T): (...args: any[]) => T;
}): DbAdapter {
  return {
    async run(sql: string, params?: SqlValue[]): Promise<RunResult> {
      const stmt = db.query(sql);
      const result = params && params.length > 0 ? stmt.run(...params) : stmt.run();
      return {
        changes: result.changes,
        lastInsertRowid: Number(result.lastInsertRowid),
      };
    },
    async all<T>(sql: string, params?: SqlValue[]): Promise<T[]> {
      const stmt = db.query(sql);
      return (params && params.length > 0 ? stmt.all(...params) : stmt.all()) as T[];
    },
    async get<T>(sql: string, params?: SqlValue[]): Promise<T | null> {
      const stmt = db.query(sql);
      return ((params && params.length > 0 ? stmt.get(...params) : stmt.get()) as T) ?? null;
    },
    async exec(sql: string): Promise<void> {
      db.run(sql);
    },
    async transaction<T>(fn: () => Promise<T>): Promise<T> {
      // bun:sqlite transactions are synchronous, but our fn is async.
      // Since bun adapter promises resolve synchronously (Promise.resolve wrappers),
      // we can safely use a sync transaction wrapper.
      const txn = db.transaction(() => {
        let result: T;
        fn().then((r) => { result = r; });
        return result!;
      });
      return txn();
    },
  };
}
