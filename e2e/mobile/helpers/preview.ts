import { expect, type Page } from '@playwright/test';

/**
 * Helpers for the player app's preview harness (`?preview=<SCREEN>` on the web
 * build, see apps/mobile/App.tsx). It renders one screen with fixed mock data —
 * no server, no room — so layouts can be asserted and screenshotted directly.
 */

export type PreviewScreen =
  | 'SCAN'
  | 'JOIN'
  | 'PICK_PROFILE'
  | 'WELCOME_BACK'
  | 'RETURNING'
  | 'WAITING'
  | 'COUNTDOWN'
  | 'MEDIA_PREVIEW'
  | 'PLAY'
  | 'RESULT'
  | 'GAME_OVER';

export type PreviewQuestionType =
  | 'multiple_choice'
  | 'true_false'
  | 'closest_wins'
  | 'predict_room';

export interface PreviewParams {
  /** Question type for PLAY and RESULT. Defaults to multiple_choice. */
  type?: PreviewQuestionType;
  /** Players in the room (3–12). Drives the RESULT and GAME_OVER standings. */
  players?: number;
  /** PLAY only: render the state after this player locked their answer in. */
  answered?: boolean;
  /** Defaults to English, which is what the assertions expect. */
  lang?: 'en' | 'it';
}

export function previewUrl(screen: PreviewScreen, params: PreviewParams = {}): string {
  const query = new URLSearchParams({ preview: screen, lang: params.lang ?? 'en' });
  if (params.type !== undefined) query.set('type', params.type);
  if (params.players !== undefined) query.set('players', String(params.players));
  if (params.answered) query.set('answered', '1');
  return `/?${query.toString()}`;
}

/** Text that only appears once the requested screen has rendered. */
function screenAnchor(screen: PreviewScreen, type: PreviewQuestionType) {
  switch (screen) {
    case 'SCAN':
      return /Join the game on TV/i;
    case 'JOIN':
      return /What's your name\?/i;
    case 'PICK_PROFILE':
      return /Who's playing\?/i;
    case 'WELCOME_BACK':
      return /Welcome back, Charlie!/i;
    case 'RETURNING':
      return /Welcome Back!/i;
    case 'WAITING':
      return /Waiting for host/i;
    case 'COUNTDOWN':
      return /Get Ready!/i;
    case 'MEDIA_PREVIEW':
      return /Look at the TV!/i;
    case 'PLAY':
      return type === 'multiple_choice' ? /Look at the TV!/i : /Q\d+ ·/;
    case 'RESULT':
      return /Your rank:/i;
    case 'GAME_OVER':
      return /Final Standings/i;
  }
}

export async function gotoPreview(
  page: Page,
  screen: PreviewScreen,
  params: PreviewParams = {},
): Promise<void> {
  await page.goto(previewUrl(screen, params));
  await expect(
    page.getByText(screenAnchor(screen, params.type ?? 'multiple_choice')).first(),
  ).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(400);
}

/** The names the preview harness gives its mock players, in ranking order. */
export const PREVIEW_PLAYER_NAMES = [
  'Alice',
  'Bob',
  'Charlie',
  'Diana',
  'Enzo',
  'Fiona',
  'George',
  'Hana',
  'Ivan',
  'Jasmine',
  'Kwame',
  'Lucia',
] as const;

/** The mock player whose phone the preview is standing in for. */
export const PREVIEW_ME = 'Charlie';

export function previewPlayerNames(count: number): string[] {
  return PREVIEW_PLAYER_NAMES.slice(0, count);
}

/**
 * A phone can scroll, so content below the fold is fine — content wider than
 * the screen is not. Fails when the page scrolls sideways.
 */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'page scrolls horizontally').toBeLessThanOrEqual(1);
}
