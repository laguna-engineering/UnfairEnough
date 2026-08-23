import { expect, test } from '@playwright/test';
import {
  GAME_CONFIGURED_PERSONALIZED_MSG,
  GAME_CONFIGURED_SET_MSG,
  navigateToLobby,
  playThroughGame,
  setupHostedMocks,
} from './helpers/hostedMocks';

/**
 * The lobby must come back in the mode the host picked last — a room that
 * silently falls back to Casual after every game makes Personalized unusable.
 */
test.describe('Game mode persistence', () => {
  test('defaults to Casual mode', async ({ page }) => {
    const helpers = await setupHostedMocks(page);
    await navigateToLobby(page, helpers);

    // "Casual" button should have the active style (we check it's visible as baseline)
    await expect(page.getByText('Casual')).toBeVisible();
    await expect(page.getByText('Personalized')).toBeVisible();
    await expect(page.getByText('Question Set')).toBeVisible();

    // Personalized controls should NOT be visible in casual mode
    await expect(page.getByText('Select at least one tag')).toHaveCount(0);
  });

  test('switching to Personalized mode shows the tag picker', async ({ page }) => {
    const helpers = await setupHostedMocks(page);
    await navigateToLobby(page, helpers);

    await page.getByText('Personalized').click();

    await expect(page.getByText('Select at least one tag').first()).toBeVisible({ timeout: 5000 });

    await expect(page.getByText('history')).toBeVisible();
    await expect(page.getByText('geography')).toBeVisible();
  });

  test('Personalized mode persists after game-over and Play Again', async ({ page }) => {
    const helpers = await setupHostedMocks(page);
    await navigateToLobby(page, helpers);

    await page.getByText('Personalized').click();
    await expect(page.getByText('Select at least one tag').first()).toBeVisible({ timeout: 5000 });

    await page.getByText('history').click();
    await page.getByText('geography').click();

    // Steppers should now be visible (Questions, Seconds, Adaptive)
    await expect(page.getByText('Questions', { exact: true })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Seconds')).toBeVisible();
    await expect(page.getByText('Adaptive')).toBeVisible();

    // Server confirms the config, then the game runs to the end.
    helpers.sendToHost(GAME_CONFIGURED_PERSONALIZED_MSG);
    await playThroughGame(page, helpers);

    await expect(page.getByText('Play Again')).toBeVisible({ timeout: 10_000 });
    await page.getByText('Play Again').click();

    await expect(page.getByText('Game Mode')).toBeVisible({ timeout: 10_000 });

    // Personalized mode should still be selected — tag picker visible
    await expect(page.getByText('Select at least one tag').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('history')).toBeVisible();
    await expect(page.getByText('geography')).toBeVisible();
  });

  test('Configured (Question Set) mode persists after game-over and Play Again', async ({
    page,
  }) => {
    const helpers = await setupHostedMocks(page);
    await navigateToLobby(page, helpers);

    await page.getByText('Question Set').click();

    // Set picker should appear with scrollable cards
    await expect(page.getByText('Geography')).toBeVisible({ timeout: 5000 });

    // Picking a set is what actually configures the game — the mode button
    // alone sends nothing, so the server has to confirm the chosen set.
    await page.getByText('Geography').click();
    helpers.sendToHost(GAME_CONFIGURED_SET_MSG);

    await playThroughGame(page, helpers);

    await expect(page.getByText('Play Again')).toBeVisible({ timeout: 10_000 });
    await page.getByText('Play Again').click();

    // Back in lobby — "Question Set" mode should still be selected
    await expect(page.getByText('Game Mode')).toBeVisible({ timeout: 10_000 });

    await expect(page.getByText('Geography')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Select at least one tag')).toHaveCount(0);
  });
});
