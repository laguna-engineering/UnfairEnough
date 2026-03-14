import type { SqlValue } from './adapter';

/**
 * Build a WHERE clause + params for host-scoped queries.
 * Centralizes the NULL-aware pattern so every query doesn't
 * need to manually handle `host_id = ?` vs `host_id IS NULL`.
 */
export function hostScope(hostId: string | null): { clause: string; params: SqlValue[] } {
  return hostId !== null
    ? { clause: 'host_id = ?', params: [hostId] }
    : { clause: 'host_id IS NULL', params: [] };
}
