import path from 'node:path';
import { expect, test } from '@playwright/test';
import { EMOJI_CATEGORY_IDS, gotoPreview } from './helpers/preview';

/**
 * Renders the emoji candidates so the set can be pruned by eye, and captures
 * the join screen in both its states — badge resting, and the picker up.
 *
 * Review artifacts, not assertions. Output: screenshots/mobile/emoji/
 * (gitignored). Each glyph is labelled `FA07`, `AN23`, … so a review can name
 * the ones to cut.
 */

const SCREENSHOT_DIR = path.join(process.cwd(), 'screenshots', 'mobile', 'emoji');

test.describe('Emoji catalog', () => {
  for (const category of EMOJI_CATEGORY_IDS) {
    test(`catalog ${category}`, async ({ page }) => {
      await gotoPreview(page, 'EMOJI_CATALOG', { category });
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `catalog-${category}.png`),
        fullPage: true,
      });
    });
  }

  test('catalog all categories', async ({ page }) => {
    await gotoPreview(page, 'EMOJI_CATALOG');
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'catalog-all.png'),
      fullPage: true,
    });
  });

  test('join screen, badge resting and picker up', async ({ page }) => {
    await gotoPreview(page, 'JOIN');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'join-resting.png') });

    // 2B: tapping the badge raises the picker over the lifted card.
    await page.getByTestId('join-badge').click();
    await expect(page.getByTestId('emoji-sheet-done')).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'join-sheet.png') });

    // Each tab, so every glyph is seen at the size the player picks it.
    for (const category of EMOJI_CATEGORY_IDS) {
      await page.getByTestId(`emoji-tab-${category}`).click();
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `join-sheet-${category}.png`) });
    }
  });
});
