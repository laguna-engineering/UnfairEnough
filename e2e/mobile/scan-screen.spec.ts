import { test, expect, type Locator } from '@playwright/test';

// React Native web renders TouchableOpacity as a <div> with aria-disabled="true",
// not a <button>. When enabled the attribute is removed entirely.
function disabledRnButton(page: import('@playwright/test').Page, name: string): Locator {
  return page.locator(`[aria-disabled="true"]:has-text("${name}")`).first();
}

test.describe('ScanScreen', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('shows title and subtitle', async ({ page }) => {
    await expect(page.getByText('Unfair Enough!')).toBeVisible();
    await expect(page.getByText('Join the game on TV')).toBeVisible();
  });

  test('shows room code input', async ({ page }) => {
    await expect(page.getByPlaceholder('XXXX')).toBeVisible();
  });

  test('Next button is disabled when code is empty', async ({ page }) => {
    await expect(page.getByText('Next')).toBeVisible();
    await expect(disabledRnButton(page, 'Next')).toBeVisible();
  });

  test('Next button enables after entering 4-char code', async ({ page }) => {
    const input = page.getByPlaceholder('XXXX');
    await input.fill('ABCD');

    await expect(page.getByText('Next')).toBeVisible();
    await expect(disabledRnButton(page, 'Next')).toHaveCount(0);
  });

  test('Next button stays disabled with partial code', async ({ page }) => {
    const input = page.getByPlaceholder('XXXX');
    await input.fill('AB');

    await expect(disabledRnButton(page, 'Next')).toBeVisible();
  });
});
