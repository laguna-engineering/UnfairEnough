/**
 * Resolve a possibly-relative media/audio URL to something the TV can load.
 * Absolute http(s) URLs pass through; in hosted mode a relative path is joined
 * to the server host; otherwise (local mode with a relative path) it is unresolvable.
 */
export function resolveMediaUrl(
  raw: string | undefined | null,
  mode: string,
  serverUrl: string | null | undefined,
): string | null {
  if (!raw) return null;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  if (mode === 'hosted' && serverUrl) {
    const host = serverUrl.replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '');
    return `http://${host}/${raw}`;
  }
  return null;
}
