import { expect, test } from '@playwright/test';

test.describe('Language switcher on ScanScreen', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('shows EN and IT language buttons', async ({ page }) => {
    await expect(page.getByText('EN', { exact: true })).toBeVisible();
    await expect(page.getByText('IT', { exact: true })).toBeVisible();
  });

  test('defaults to English UI text', async ({ page }) => {
    await expect(page.getByText('Join the game on TV')).toBeVisible();
    await expect(page.getByText('Enter room code:')).toBeVisible();
    await expect(page.getByText('Next')).toBeVisible();
  });

  test('switching to IT updates all text to Italian', async ({ page }) => {
    await page.getByText('IT', { exact: true }).click();

    await expect(page.getByText('Unisciti alla partita in TV')).toBeVisible();
    await expect(page.getByText('Inserisci codice stanza:')).toBeVisible();
    await expect(page.getByText('Avanti')).toBeVisible();
  });

  test('switching back to EN restores English text', async ({ page }) => {
    // Switch to Italian first
    await page.getByText('IT', { exact: true }).click();
    await expect(page.getByText('Unisciti alla partita in TV')).toBeVisible();

    // Switch back to English
    await page.getByText('EN', { exact: true }).click();
    await expect(page.getByText('Join the game on TV')).toBeVisible();
    await expect(page.getByText('Enter room code:')).toBeVisible();
    await expect(page.getByText('Next')).toBeVisible();
  });

  test('language choice persists after entering a room code', async ({ page }) => {
    // Switch to Italian
    await page.getByText('IT', { exact: true }).click();
    await expect(page.getByText('Avanti')).toBeVisible();

    // Enter a room code - button text should stay in Italian
    const input = page.getByPlaceholder('XXXX');
    await input.fill('ABCD');
    await expect(page.getByText('Avanti')).toBeVisible();
  });
});
