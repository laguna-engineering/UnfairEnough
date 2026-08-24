import path from 'node:path';
import { test } from '@playwright/test';
import { gotoPreview, type PreviewQuestionType } from './helpers/preview';

/**
 * Every TV screen that renders a player name, with the worst name the join
 * screen can produce: MAX_NAME_LENGTH characters and no space to wrap on.
 * Review artifacts — the assertions that must hold live in crowded-room.spec.ts.
 *
 * Output: screenshots/tv-host/long-names/ (gitignored).
 */

const SCREENSHOT_DIR = path.join(process.cwd(), 'screenshots', 'tv-host', 'long-names');

const QUESTION_TYPES: PreviewQuestionType[] = [
  'multiple_choice',
  'true_false',
  'closest_wins',
  'predict_room',
];

test.describe('TV long-name screenshots', () => {
  for (const players of [5, 12, 50]) {
    test(`LOBBY with ${players} players`, async ({ page }) => {
      await gotoPreview(page, 'LOBBY', { players, longNames: true });
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `lobby-${players}p.png`) });
    });

    test(`GAME_OVER with ${players} players`, async ({ page }) => {
      await gotoPreview(page, 'GAME_OVER', { players, longNames: true });
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `game-over-${players}p.png`) });
    });

    for (const type of QUESTION_TYPES) {
      test(`RESULTS ${type} with ${players} players`, async ({ page }) => {
        await gotoPreview(page, 'RESULTS', { players, type, longNames: true });
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, `results-${type}-${players}p.png`),
        });
      });
    }
  }

  test('QUESTION closest_wins with 12 players', async ({ page }) => {
    await gotoPreview(page, 'QUESTION', { players: 12, type: 'closest_wins', longNames: true });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'question-closest_wins-12p.png') });
  });
});
