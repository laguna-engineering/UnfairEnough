import { expect, test } from '@playwright/test';
import {
  navigateToLobby,
  playerJoinedMsg,
  playerLeftMsg,
  setupHostedMocks,
} from './helpers/hostedMocks';
import { expectInsideViewport } from './helpers/preview';

/**
 * Connection and lobby flows, driven by a mocked server so the real
 * HostedGameController and reducers run. The preview harness can't cover these:
 * it starts from a finished room and never opens a socket.
 */

const ROOM_NAMES = [
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
];

test.describe('Connecting to a hosted server', () => {
  test('the connect screen asks for a server and reaches the lobby', async ({ page }) => {
    const helpers = await setupHostedMocks(page);
    await navigateToLobby(page, helpers);

    // The room code the server handed out has to be on screen — it is the only
    // way players without the QR can join.
    await expect(page.getByText('TEST')).toBeVisible();
  });

  test('the lobby shows the join instructions alongside the code', async ({ page }) => {
    const helpers = await setupHostedMocks(page);
    await navigateToLobby(page, helpers);

    // Nothing is playable until a phone can find the room, so the QR caption
    // and the typed-code fallback both have to be there.
    await expect(page.getByText(/Scan the QR code/i)).toBeVisible();
    await expect(page.getByText(/enter code/i)).toBeVisible();
  });
});

test.describe('Players joining and leaving', () => {
  test('the lobby counts every join up to the 12-player cap', async ({ page }) => {
    const helpers = await setupHostedMocks(page);
    await navigateToLobby(page, helpers);

    for (const [i, name] of ROOM_NAMES.entries()) {
      helpers.sendToHost(playerJoinedMsg(i, name));
      await expect(page.getByText(`${i + 1} player${i === 0 ? '' : 's'} ready`)).toBeVisible({
        timeout: 5000,
      });
    }

    // Past 7 the row collapses to 6 avatars plus a "+N" badge.
    await expect(page.getByTestId('lobby-player-avatar')).toHaveCount(6);
    await expect(page.getByTestId('lobby-overflow-badge')).toHaveText('+6');
  });

  test('a player leaving drops out of the count', async ({ page }) => {
    const helpers = await setupHostedMocks(page);
    await navigateToLobby(page, helpers);

    for (const [i, name] of ROOM_NAMES.slice(0, 5).entries()) {
      helpers.sendToHost(playerJoinedMsg(i, name));
    }
    await expect(page.getByText('5 players ready')).toBeVisible({ timeout: 5000 });

    helpers.sendToHost(playerLeftMsg('p3'));
    await expect(page.getByText('4 players ready')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Charlie')).toHaveCount(0);
  });

  test('a full room keeps the Start button reachable', async ({ page }) => {
    const helpers = await setupHostedMocks(page);
    await navigateToLobby(page, helpers);

    for (const [i, name] of ROOM_NAMES.entries()) {
      helpers.sendToHost(playerJoinedMsg(i, name));
    }
    await expect(page.getByText('12 players ready')).toBeVisible({ timeout: 5000 });

    await expectInsideViewport(page, page.getByText('Start Game'), 'Start Game button');
  });
});

test.describe('Starting a game', () => {
  test('the host can start once a player has joined', async ({ page }) => {
    const helpers = await setupHostedMocks(page);
    await navigateToLobby(page, helpers);

    helpers.sendToHost(playerJoinedMsg(0, 'Alice'));
    await expect(page.getByText('1 player ready')).toBeVisible({ timeout: 5000 });

    await page.getByText('Start Game').click();

    await expect
      .poll(() => helpers.clientMessages.map((m) => m.type), { timeout: 5000 })
      .toContain('START_GAME');
  });
});
