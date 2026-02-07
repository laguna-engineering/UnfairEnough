import type { DbAdapter, RunResult, SqlValue } from './adapter';

/**
 * Creates a DbAdapter wrapping expo-sqlite's async SQLiteDatabase.
 *
 * expo-sqlite API:
 *   db.runAsync(sql, ...params) -> { lastInsertRowId, changes }
 *   db.getAllAsync(sql, ...params) -> T[]
 *   db.getFirstAsync(sql, ...params) -> T | null
 *   db.execAsync(sql) -> void  (no params, no escaping — use for DDL/PRAGMAs only)
 *   db.withTransactionAsync(fn) -> Promise<void>
 */
export function createExpoAdapter(db: {
  runAsync(sql: string, ...params: SqlValue[]): Promise<{ lastInsertRowId: number; changes: number }>;
  getAllAsync<T>(sql: string, ...params: SqlValue[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, ...params: SqlValue[]): Promise<T | null>;
  execAsync(sql: string): Promise<void>;
  withTransactionAsync(fn: () => Promise<void>): Promise<void>;
}): DbAdapter {
  return {
    async run(sql: string, params?: SqlValue[]): Promise<RunResult> {
      const result = params && params.length > 0
        ? await db.runAsync(sql, ...params)
        : await db.runAsync(sql);
      return {
        changes: result.changes,
        lastInsertRowid: result.lastInsertRowId,
      };
    },

    async all<T>(sql: string, params?: SqlValue[]): Promise<T[]> {
      return params && params.length > 0
        ? await db.getAllAsync<T>(sql, ...params)
        : await db.getAllAsync<T>(sql);
    },

    async get<T>(sql: string, params?: SqlValue[]): Promise<T | null> {
      return params && params.length > 0
        ? await db.getFirstAsync<T>(sql, ...params)
        : await db.getFirstAsync<T>(sql);
    },

    async exec(sql: string): Promise<void> {
      await db.execAsync(sql);
    },

    async transaction<T>(fn: () => Promise<T>): Promise<T> {
      let result: T;
      await db.withTransactionAsync(async () => {
        result = await fn();
      });
      return result!;
    },
  };
}
