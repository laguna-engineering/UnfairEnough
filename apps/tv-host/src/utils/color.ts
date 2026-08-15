/** Convert a `#rrggbb` hex color to an `rgba(r,g,b,alpha)` string, for tinted
 * badge/pill backgrounds over the dark theme (the type-badge pills use this
 * for a soft fill + full-opacity border/text, mirroring the design mock). */
export function withAlpha(hex: string, alpha: number): string {
  const num = Number.parseInt(hex.replace('#', ''), 16);
  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
