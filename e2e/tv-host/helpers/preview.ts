import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Helpers for the TV app's preview harness (`?preview=<PHASE>` on the web
 * build, see apps/tv-host/App.tsx). The harness boots a fake room straight into
 * a phase, so tests can inspect a 12-player RESULTS screen without playing a
 * 12-player game.
 */

export type PreviewPhase =
  | 'LOBBY'
  | 'COUNTDOWN'
  | 'MEDIA_PREVIEW'
  | 'QUESTION'
  | 'REVEALING'
  | 'RESULTS'
  | 'GAME_OVER';

export type PreviewQuestionType =
  | 'multiple_choice'
  | 'true_false'
  | 'closest_wins'
  | 'predict_room';

export interface PreviewParams {
  /** Players in the room (1–12). The harness defaults to 8. */
  players?: number;
  /** Question type for the QUESTION / RESULTS screens. Defaults to multiple_choice. */
  type?: PreviewQuestionType;
  /** How many players have answered on the QUESTION screen. */
  answered?: number;
  /** Language to render in. Defaults to English, which is what assertions expect. */
  lang?: 'en' | 'it';
  /** Give every player a worst-case max-length name with nowhere to wrap. */
  longNames?: boolean;
}

export function previewUrl(phase: PreviewPhase, params: PreviewParams = {}): string {
  const query = new URLSearchParams({ preview: phase, lang: params.lang ?? 'en' });
  if (params.players !== undefined) query.set('players', String(params.players));
  if (params.type !== undefined) query.set('type', params.type);
  if (params.answered !== undefined) query.set('answered', String(params.answered));
  if (params.longNames) query.set('names', 'long');
  return `/?${query.toString()}`;
}

/**
 * A piece of text that only appears once the requested phase has actually
 * rendered — waiting on it means we never screenshot the splash screen.
 */
function phaseAnchor(page: Page, phase: PreviewPhase, type: PreviewQuestionType): Locator {
  switch (phase) {
    case 'LOBBY':
      return page.getByText('Game Mode');
    case 'COUNTDOWN':
      return page.getByText('Get Ready!');
    case 'MEDIA_PREVIEW':
      return page.getByText(/Question \d+ of \d+/);
    case 'QUESTION':
      return page.getByText(/Question \d+ of \d+/).first();
    case 'REVEALING':
      return page.getByText("Let's see...");
    case 'RESULTS':
      if (type === 'closest_wins') return page.getByText('THE ANSWER');
      if (type === 'predict_room') return page.getByText("ROOM'S PICK");
      // Past the top-12 cut-off the board is headed "TOP 12" instead.
      return page.getByText(/^(Leaderboard|TOP 12)$/);
    case 'GAME_OVER':
      return page.getByText('Game Over!');
  }
}

const MOCK_QUESTION_SETS = {
  sets: [
    { id: 'set-1', name: 'Geography', questionCount: 42, isMeta: false, language: 'en' },
    { id: 'set-2', name: 'Science', questionCount: 30, isMeta: false, language: 'en' },
    { id: 'set-3', name: 'Italian Cuisine', questionCount: 24, isMeta: false, language: 'en' },
    { id: 'meta-1', name: 'All Questions', questionCount: 96, isMeta: true, language: 'en' },
  ],
};

const MOCK_TAGS = {
  tags: [
    { tag: 'history', questionCount: 24, playerCount: 0 },
    { tag: 'geography', questionCount: 19, playerCount: 0 },
    { tag: 'music', questionCount: 12, playerCount: 0 },
    { tag: 'sport', questionCount: 9, playerCount: 0 },
  ],
  totalPlayers: 0,
};

/**
 * The preview harness has no socket, but the lobby still calls the hosted
 * server's REST endpoints for its question sets and tags. Serving them here is
 * what makes the lobby preview look like a real room instead of an empty one.
 */
export async function mockLobbyApis(page: Page): Promise<void> {
  await page.route('**/api/question-sets*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_QUESTION_SETS),
    }),
  );
  await page.route('**/api/tags*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_TAGS),
    }),
  );
}

/**
 * Navigate to a preview phase and wait until it has painted. Expo's web dev
 * server compiles on first request, hence the generous timeout.
 */
export async function gotoPreview(
  page: Page,
  phase: PreviewPhase,
  params: PreviewParams = {},
): Promise<void> {
  await mockLobbyApis(page);
  await page.goto(previewUrl(phase, params));
  await expect(phaseAnchor(page, phase, params.type ?? 'multiple_choice')).toBeVisible({
    timeout: 60_000,
  });
  // Entry animations (fades, timer sweeps) settle within a frame or two.
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

export function previewPlayerNames(count: number): string[] {
  return PREVIEW_PLAYER_NAMES.slice(0, count);
}

/**
 * Fails when any two of the given elements overlap. Playwright counts a covered
 * element as "visible", so this is the only way to catch chips and cards that
 * render on top of each other once the room gets crowded.
 */
export async function expectNoOverlap(locators: Locator[], labels: string[]): Promise<void> {
  const boxes = await Promise.all(locators.map((l) => l.boundingBox()));

  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (!a || !b) continue;
      const overlaps =
        a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      expect(overlaps, `${labels[i]} overlaps ${labels[j]}`).toBe(false);
    }
  }
}

/** Fails when the element is (even partly) outside the visible viewport. */
export async function expectInsideViewport(page: Page, locator: Locator, label: string) {
  const box = await locator.boundingBox();
  expect(box, `${label} has no layout box`).not.toBeNull();
  const viewport = page.viewportSize();
  if (!box || !viewport) return;

  expect(box.y >= -1, `${label} is cut off at the top (y=${box.y})`).toBe(true);
  expect(
    box.y + box.height <= viewport.height + 1,
    `${label} is cut off at the bottom (bottom=${box.y + box.height}, viewport=${viewport.height})`,
  ).toBe(true);
  expect(box.x >= -1, `${label} is cut off on the left (x=${box.x})`).toBe(true);
  expect(
    box.x + box.width <= viewport.width + 1,
    `${label} is cut off on the right (right=${box.x + box.width}, viewport=${viewport.width})`,
  ).toBe(true);
}
