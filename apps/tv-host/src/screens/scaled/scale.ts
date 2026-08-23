/**
 * Rules for the "big room" TV layouts.
 *
 * Past a handful of players the shared screen can no longer name everybody: a
 * per-player chip, marker or leaderboard row shrinks until it is unreadable
 * from the back of the room. From six players up, the TV switches to layouts
 * that show *shape* — how the room split, how far off it was, who is on top —
 * and leaves each player's own result on their phone.
 */

/** Six players and up gets the at-scale layouts. */
export const SCALED_LAYOUT_MIN_PLAYERS = 6;

/** How many players the at-scale leaderboard names before the rest become bands. */
export const LEADERBOARD_TOP_N = 12;

/** How many closest guesses the closest-wins screen names. */
export const CLOSEST_TOP_N = 5;

/** How many rank lines the game-over chart plots before the rest become a band. */
export const CHART_TOP_N = 8;

export function isScaledRoom(playerCount: number): boolean {
  return playerCount >= SCALED_LAYOUT_MIN_PLAYERS;
}
