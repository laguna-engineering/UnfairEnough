// Toggleable debug logging shared across the server and apps.
//
// Each app calls setDebugEnabled() once at startup (e.g. from an env var), then
// call sites use debugLog(...) exactly like console.log. Output is suppressed
// entirely unless debug is enabled, so these can stay in the codebase.

let enabled = false;

/** Turn debug logging on or off. Call once at app startup. */
export function setDebugEnabled(on: boolean): void {
  enabled = on;
}

/** Whether debug logging is currently on. */
export function isDebugEnabled(): boolean {
  return enabled;
}

/** Log only when debug is enabled. Same signature as console.log. */
export function debugLog(...args: unknown[]): void {
  if (enabled) console.log(...args);
}
