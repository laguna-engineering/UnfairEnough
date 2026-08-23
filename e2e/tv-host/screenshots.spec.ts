import path from 'node:path';
import { test } from '@playwright/test';
import { gotoPreview, type PreviewQuestionType } from './helpers/preview';

/**
 * Captures a 1080p screenshot of every TV screen across the room sizes we care
 * about. These are review artifacts, not assertions — nothing here fails on a
 * pixel change. The layout rules that *must* hold are asserted in
 * crowded-room.spec.ts and question-types.spec.ts.
 *
 * Output: screenshots/tv-host/ (gitignored). Run `yarn test:e2e --project="TV Host"`.
 */

const SCREENSHOT_DIR = path.join(process.cwd(), 'screenshots', 'tv-host');

const QUESTION_TYPES: PreviewQuestionType[] = [
  'multiple_choice',
  'true_false',
  'closest_wins',
  'predict_room',
];

// A small room, a full room (12 is the cap), and a deliberately over-capacity
// one — 50 is not reachable today, it shows where these layouts give out if the
// cap is ever raised.
const ROOM_SIZES = [5, 12, 50];

test.describe('TV screenshots', () => {
  for (const players of [2, 5, 8, 12, 50]) {
    test(`LOBBY with ${players} players`, async ({ page }) => {
      await gotoPreview(page, 'LOBBY', { players });
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `lobby-${players}p.png`) });
    });
  }

  for (const phase of ['COUNTDOWN', 'MEDIA_PREVIEW', 'REVEALING'] as const) {
    test(`${phase}`, async ({ page }) => {
      await gotoPreview(page, phase, { players: 8 });
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `${phase.toLowerCase().replace('_', '-')}-8p.png`),
      });
    });
  }

  for (const type of QUESTION_TYPES) {
    for (const players of ROOM_SIZES) {
      test(`QUESTION ${type} with ${players} players`, async ({ page }) => {
        await gotoPreview(page, 'QUESTION', { players, type });
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, `question-${type}-${players}p.png`),
        });
      });

      test(`RESULTS ${type} with ${players} players`, async ({ page }) => {
        await gotoPreview(page, 'RESULTS', { players, type });
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, `results-${type}-${players}p.png`),
        });
      });
    }
  }

  for (const players of [5, 12, 50]) {
    test(`GAME_OVER with ${players} players`, async ({ page }) => {
      await gotoPreview(page, 'GAME_OVER', { players });
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `game-over-${players}p.png`) });
    });
  }
});
