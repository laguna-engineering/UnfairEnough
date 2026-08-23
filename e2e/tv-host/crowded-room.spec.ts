import { expect, test } from '@playwright/test';
import { expectInsideViewport, gotoPreview, previewPlayerNames } from './helpers/preview';

/**
 * A TV screen cannot scroll and nobody can interact with it, so anything that
 * lands outside the 1080p viewport is content the room never sees. These tests
 * pin the layout rules for rooms bigger than the 4–5 players most development
 * happens with, up to the 12-player cap.
 */

const CROWDED_SIZES = [5, 8, 12];

test.describe('Lobby with a full room', () => {
  // The lobby shows 7 avatars, or 6 plus a "+N" badge once N would not fit.
  for (const { players, avatars, badge } of [
    { players: 2, avatars: 2, badge: null },
    { players: 5, avatars: 5, badge: null },
    { players: 7, avatars: 7, badge: null },
    { players: 8, avatars: 6, badge: '+2' },
    { players: 12, avatars: 6, badge: '+6' },
  ]) {
    test(`${players} players → ${avatars} avatars${badge ? ` and a ${badge} badge` : ''}`, async ({
      page,
    }) => {
      await gotoPreview(page, 'LOBBY', { players });

      await expect(page.getByText(`${players} players ready`)).toBeVisible();
      await expect(page.getByTestId('lobby-player-avatar')).toHaveCount(avatars);

      const overflowBadge = page.getByTestId('lobby-overflow-badge');
      if (badge) {
        await expect(overflowBadge).toHaveText(badge);
      } else {
        await expect(overflowBadge).toHaveCount(0);
      }

      // The join QR and the Start button must stay reachable no matter how
      // many avatars the row has to fit.
      await expectInsideViewport(page, page.getByText('Start Game'), 'Start Game button');
    });
  }

  test('the avatar row never pushes the game-mode selector off screen', async ({ page }) => {
    await gotoPreview(page, 'LOBBY', { players: 12 });

    for (const mode of ['Casual', 'Question Set', 'Personalized']) {
      await expectInsideViewport(page, page.getByText(mode, { exact: true }), `${mode} button`);
    }
  });
});

test.describe('Results leaderboard with a full room', () => {
  for (const players of CROWDED_SIZES) {
    test(`shows a row per player with ${players} players`, async ({ page }) => {
      await gotoPreview(page, 'RESULTS', { players });

      const rows = page.getByTestId('leaderboard-row');
      await expect(rows).toHaveCount(players);

      // Every player must be able to find themselves — a leaderboard that
      // silently drops the tail is worse than one that shrinks.
      for (const name of previewPlayerNames(players)) {
        await expect(page.getByText(name, { exact: true })).toBeVisible();
      }
    });

    test(`keeps every leaderboard row on screen with ${players} players`, async ({ page }) => {
      await gotoPreview(page, 'RESULTS', { players });

      const rows = page.getByTestId('leaderboard-row');
      const count = await rows.count();
      for (let i = 0; i < count; i++) {
        await expectInsideViewport(page, rows.nth(i), `leaderboard row ${i + 1}/${count}`);
      }
    });
  }

  test('splits into two columns past 8 players', async ({ page }) => {
    await gotoPreview(page, 'RESULTS', { players: 12 });

    const rows = page.getByTestId('leaderboard-row');
    const firstBox = await rows.first().boundingBox();
    const lastBox = await rows.last().boundingBox();
    expect(firstBox && lastBox).toBeTruthy();
    if (!firstBox || !lastBox) return;

    // #12 sits in the second column, i.e. to the right of #1 rather than below
    // a 12-row stack that would not fit.
    expect(lastBox.x).toBeGreaterThan(firstBox.x + firstBox.width / 2);
  });

  test('stays in one column at 8 players', async ({ page }) => {
    await gotoPreview(page, 'RESULTS', { players: 8 });

    const rows = page.getByTestId('leaderboard-row');
    const firstBox = await rows.first().boundingBox();
    const lastBox = await rows.last().boundingBox();
    if (!firstBox || !lastBox) throw new Error('leaderboard rows have no layout box');

    expect(lastBox.x).toBeCloseTo(firstBox.x, 0);
    expect(lastBox.y).toBeGreaterThan(firstBox.y);
  });
});

test.describe('Game over with a full room', () => {
  for (const players of CROWDED_SIZES) {
    test(`podium and rank chart hold up with ${players} players`, async ({ page }) => {
      await gotoPreview(page, 'GAME_OVER', { players });

      await expect(page.getByText('Game Over!')).toBeVisible();
      await expect(page.getByText('Winner')).toBeVisible();

      // The podium is always the top three (or fewer in a tiny room).
      const podium = previewPlayerNames(Math.min(3, players));
      for (const name of podium) {
        await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
      }

      await expect(page.getByText('Rank Progression')).toBeVisible();
      await expectInsideViewport(page, page.getByText('Play Again'), 'Play Again button');
    });
  }

  test('the rank chart plots every player, not just the podium', async ({ page }) => {
    await gotoPreview(page, 'GAME_OVER', { players: 12 });

    // The chart legend is the only place the bottom half of the room appears.
    for (const name of previewPlayerNames(12)) {
      await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
    }
  });
});
