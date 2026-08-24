import path from 'node:path';
import { expect, test } from '@playwright/test';
import { type HostedMocks, ROOM_CREATED_MSG, setupHostedMocks } from './helpers/hostedMocks';

/**
 * Session persistence and logout on the web TV host. The web build stores the
 * device-flow session token in localStorage (AsyncStorage's web backend) and
 * must reuse it on the next visit — a host who approved the TV once should not
 * have to grab their phone again on every page load. Logout is the only way to
 * hand the TV to someone else's account, so it must revoke the token
 * server-side AND forget it locally.
 */

const STORAGE_KEY = 'unfairenough_tv_auth';
const SCREENSHOT_DIR = path.join(process.cwd(), 'screenshots', 'tv-host');

const AUTH_SUCCESS_MSG = JSON.stringify({
  type: 'AUTH_SUCCESS',
  payload: { sessionToken: 'test-token-123', hostId: 'host-1', displayName: 'Test Host' },
});

const SESSION_INVALID_MSG = JSON.stringify({
  type: 'ERROR',
  payload: { code: 'SESSION_INVALID', message: 'Session token is invalid or expired' },
});

/**
 * Connect and complete the device-flow login: the mock approves the login
 * (AUTH_SUCCESS) before opening the room, so the app saves a session token the
 * way a real first visit does.
 */
async function loginToLobby(page: import('@playwright/test').Page, helpers: HostedMocks) {
  await page.goto('/?lang=en');

  const input = page.getByPlaceholder('192.168.1.100:3000');
  await expect(input).toBeVisible({ timeout: 60_000 });
  await input.fill('localhost:3000');
  await page.getByText('Connect', { exact: true }).click();

  await helpers.waitForWs();
  helpers.sendToHost(AUTH_SUCCESS_MSG);
  helpers.sendToHost(ROOM_CREATED_MSG);

  await expect(page.getByText('Game Mode')).toBeVisible({ timeout: 10_000 });
}

test.describe('Logging out from the lobby', () => {
  test('the hosted lobby offers a logout button', async ({ page }) => {
    const helpers = await setupHostedMocks(page);
    await loginToLobby(page, helpers);

    await expect(page.getByText('Log out')).toBeVisible();
    // Review artifact: the preview harness never gets an onLogout, so the
    // screenshot suite can't show this button — capture it here instead.
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'lobby-logout.png') });
  });

  test('logging out revokes the session and forgets the token', async ({ page }) => {
    const helpers = await setupHostedMocks(page);

    let revokedWith: string | null = null;
    await page.route('**/auth/logout', (route) => {
      revokedWith = route.request().headers().authorization ?? null;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Logged out' }),
      });
    });

    await loginToLobby(page, helpers);
    await page.getByText('Log out').click();

    // The token the server handed out must be the one revoked — a logout that
    // only clears localStorage leaves a live 365-day session on the server.
    await expect.poll(() => revokedWith, { timeout: 5000 }).toBe('Bearer test-token-123');

    // Back at the connect screen, with nothing left to auto-connect from.
    await expect(page.getByPlaceholder('192.168.1.100:3000')).toBeVisible({ timeout: 10_000 });
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull();
  });
});

test.describe('Returning with a stored session', () => {
  const storedAuth = JSON.stringify({
    sessionToken: 'stored-token',
    serverUrl: 'localhost:3000',
    hostDisplayName: 'Test Host',
    hostId: 'host-1',
  });

  test('a stored token skips the connect screen entirely', async ({ page }) => {
    const helpers = await setupHostedMocks(page);
    await page.addInitScript(
      ([key, value]) => localStorage.setItem(key, value),
      [STORAGE_KEY, storedAuth],
    );

    await page.goto('/?lang=en');
    await helpers.waitForWs(60_000);

    // The reconnect must present the stored token — without it the server
    // would fall into the unauthenticated legacy-host path.
    expect(helpers.wsUrl()).toContain('token=stored-token');

    helpers.sendToHost(ROOM_CREATED_MSG);
    await expect(page.getByText('Game Mode')).toBeVisible({ timeout: 10_000 });
  });

  test('a rejected token falls back to the connect screen and is dropped', async ({ page }) => {
    const helpers = await setupHostedMocks(page);
    await page.addInitScript(
      ([key, value]) => localStorage.setItem(key, value),
      [STORAGE_KEY, storedAuth],
    );

    await page.goto('/?lang=en');
    await helpers.waitForWs(60_000);
    helpers.sendToHost(SESSION_INVALID_MSG);

    // A revoked/expired token must not wedge the TV in a reconnect loop: the
    // host gets the connect screen back and the dead token is discarded.
    await expect(page.getByPlaceholder('192.168.1.100:3000')).toBeVisible({ timeout: 10_000 });
    await expect
      .poll(() => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY), {
        timeout: 5000,
      })
      .toBeNull();
  });
});
