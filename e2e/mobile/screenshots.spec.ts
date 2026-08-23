import path from 'node:path';
import { test } from '@playwright/test';
import { gotoPreview, type PreviewQuestionType, type PreviewScreen } from './helpers/preview';

/**
 * Captures a phone-sized screenshot of every player screen. Review artifacts,
 * not assertions — the rules that must hold live in preview-screens.spec.ts.
 *
 * Output: screenshots/mobile/ (gitignored).
 */

const SCREENSHOT_DIR = path.join(process.cwd(), 'screenshots', 'mobile');

const QUESTION_TYPES: PreviewQuestionType[] = [
  'multiple_choice',
  'true_false',
  'closest_wins',
  'predict_room',
];

const SIMPLE_SCREENS: PreviewScreen[] = [
  'SCAN',
  'JOIN',
  'PICK_PROFILE',
  'WELCOME_BACK',
  'RETURNING',
  'WAITING',
  'COUNTDOWN',
  'MEDIA_PREVIEW',
];

test.describe('Player app screenshots', () => {
  for (const screen of SIMPLE_SCREENS) {
    test(`${screen}`, async ({ page }) => {
      await gotoPreview(page, screen);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `${screen.toLowerCase().replace('_', '-')}.png`),
        fullPage: true,
      });
    });
  }

  for (const type of QUESTION_TYPES) {
    test(`PLAY ${type}`, async ({ page }) => {
      await gotoPreview(page, 'PLAY', { type });
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `play-${type}.png`),
        fullPage: true,
      });
    });

    test(`PLAY ${type} after answering`, async ({ page }) => {
      await gotoPreview(page, 'PLAY', { type, answered: true });
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `play-${type}-answered.png`),
        fullPage: true,
      });
    });

    for (const players of [12, 50]) {
      test(`RESULT ${type} with ${players} players`, async ({ page }) => {
        await gotoPreview(page, 'RESULT', { type, players });
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, `result-${type}-${players}p.png`),
          fullPage: true,
        });
      });
    }
  }

  // 12 is the room cap; 50 shows where the standings give out if it is raised.
  for (const players of [5, 12, 50]) {
    test(`GAME_OVER with ${players} players`, async ({ page }) => {
      await gotoPreview(page, 'GAME_OVER', { players });
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `game-over-${players}p.png`),
        fullPage: true,
      });
    });
  }
});
