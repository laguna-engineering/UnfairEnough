import { expect, type Page, test, type WebSocketRoute } from '@playwright/test';

const MOCK_QUESTION_SETS = {
  sets: [
    { id: 'set-1', name: 'Geography', questionCount: 10, isMeta: false, language: 'en' },
    { id: 'set-2', name: 'Science', questionCount: 8, isMeta: false, language: 'en' },
    { id: 'meta-1', name: 'All Questions', questionCount: 18, isMeta: true, language: 'en' },
  ],
};

const MOCK_TAGS = {
  tags: [
    { tag: 'history', questionCount: 12, playerCount: 0 },
    { tag: 'geography', questionCount: 9, playerCount: 0 },
  ],
  totalPlayers: 0,
};

const ROOM_CREATED_MSG = JSON.stringify({
  type: 'ROOM_CREATED',
  payload: { roomCode: 'TEST' },
});

const GAME_CONFIGURED_PERSONALIZED_MSG = JSON.stringify({
  type: 'GAME_CONFIGURED',
  payload: {
    gameType: 'personalized',
    tags: ['history', 'geography'],
    adaptiveMode: true,
    questionCount: 10,
  },
});

const GAME_STARTING_MSG = JSON.stringify({
  type: 'GAME_STARTING',
  payload: { countdown: 3 },
});

const QUESTION_MSG = JSON.stringify({
  type: 'QUESTION',
  payload: {
    id: 'q1',
    text: 'What is 2+2?',
    options: [
      { key: 'A', text: '3' },
      { key: 'B', text: '4' },
      { key: 'C', text: '5' },
      { key: 'D', text: '6' },
    ],
    timeLimit: 10,
    questionNumber: 1,
    totalQuestions: 1,
    serverTimestamp: Date.now(),
  },
});

const ROUND_END_MSG = JSON.stringify({
  type: 'ROUND_END',
  payload: {
    questionId: 'q1',
    correctAnswer: 'B',
    playerResults: [],
    rankings: [],
    tags: ['math'],
  },
});

const GAME_OVER_MSG = JSON.stringify({ type: 'GAME_OVER', payload: {} });

/**
 * Sets up route mocks for the hosted server's health check, question sets API,
 * and tags API, then intercepts the host WebSocket connection.
 */
async function setupHostedMocks(page: Page) {
  const clientMessages: Array<{ type: string; payload?: unknown }> = [];
  let wsRoute: WebSocketRoute | null = null;

  // Mock health check
  await page.route('**/api/health', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok', lanIp: 'localhost', port: 3000 }),
    }),
  );

  // Mock question sets API (configured mode)
  await page.route('**/api/question-sets*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_QUESTION_SETS),
    }),
  );

  // Mock tags API (personalized mode)
  await page.route('**/api/tags*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_TAGS),
    }),
  );

  // Intercept WebSocket
  await page.routeWebSocket(/ws:\/\/localhost(:\d+)?\/ws/, (ws) => {
    wsRoute = ws;
    ws.onMessage((raw) => {
      const msg = JSON.parse(raw as string);
      // Ignore PING messages
      if (msg.type !== 'PING') {
        clientMessages.push(msg);
      }
    });
  });

  const sendToHost = (data: string) => {
    if (!wsRoute) throw new Error('WebSocket not connected yet');
    wsRoute.send(data);
  };

  const waitForWs = async (timeoutMs = 5000) => {
    const deadline = Date.now() + timeoutMs;
    while (!wsRoute && Date.now() < deadline) {
      await page.waitForTimeout(100);
    }
    if (!wsRoute) throw new Error('WebSocket did not connect in time');
  };

  return { clientMessages, sendToHost, waitForWs };
}

/**
 * Navigate from ConnectScreen → lobby by connecting to a mock server.
 */
async function navigateToLobby(page: Page, helpers: Awaited<ReturnType<typeof setupHostedMocks>>) {
  await page.goto('/');

  // ConnectScreen: enter server address and connect
  const input = page.getByPlaceholder('192.168.1.100:3000');
  await expect(input).toBeVisible({ timeout: 10_000 });
  await input.fill('localhost:3000');
  await page.getByText('Connect').click();

  // Wait for WS connection and send ROOM_CREATED
  await helpers.waitForWs();
  helpers.sendToHost(ROOM_CREATED_MSG);

  // Wait for lobby to appear
  await expect(page.getByText('Game Mode')).toBeVisible({ timeout: 10_000 });
}

test.describe('Game mode persistence', () => {
  test('defaults to Casual mode', async ({ page }) => {
    const helpers = await setupHostedMocks(page);
    await navigateToLobby(page, helpers);

    // "Casual" button should have the active style (we check it's visible as baseline)
    await expect(page.getByText('Casual')).toBeVisible();
    await expect(page.getByText('Personalized')).toBeVisible();
    await expect(page.getByText('Question Set')).toBeVisible();

    // Personalized controls should NOT be visible in casual mode
    await expect(page.getByText('Select at least one tag')).not.toBeVisible();
  });

  test('switching to Personalized mode shows the tag picker', async ({ page }) => {
    const helpers = await setupHostedMocks(page);
    await navigateToLobby(page, helpers);

    // Click Personalized
    await page.getByText('Personalized').click();

    // Personalized controls should appear — "Select at least one tag" hint
    await expect(page.getByText('Select at least one tag')).toBeVisible({ timeout: 5000 });

    // Tag chips should be visible
    await expect(page.getByText('history')).toBeVisible();
    await expect(page.getByText('geography')).toBeVisible();
  });

  test('Personalized mode persists after game-over and Play Again', async ({ page }) => {
    const helpers = await setupHostedMocks(page);
    await navigateToLobby(page, helpers);

    // Select Personalized mode
    await page.getByText('Personalized').click();
    await expect(page.getByText('Select at least one tag')).toBeVisible({ timeout: 5000 });

    // Select both tags
    await page.getByText('history').click();
    await page.getByText('geography').click();

    // Steppers should now be visible (Questions, Seconds, Adaptive)
    await expect(page.getByText('Questions')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Seconds')).toBeVisible();
    await expect(page.getByText('Adaptive')).toBeVisible();

    // Server confirms the config
    helpers.sendToHost(GAME_CONFIGURED_PERSONALIZED_MSG);

    // Simulate a game: GAME_STARTING → QUESTION → ROUND_END → GAME_OVER
    helpers.sendToHost(GAME_STARTING_MSG);

    // Wait for countdown screen
    await page.waitForTimeout(500);

    helpers.sendToHost(QUESTION_MSG);
    await page.waitForTimeout(500);

    helpers.sendToHost(ROUND_END_MSG);
    await page.waitForTimeout(500);

    helpers.sendToHost(GAME_OVER_MSG);

    // Game Over screen should show "Play Again"
    await expect(page.getByText('Play Again')).toBeVisible({ timeout: 10_000 });

    // Click Play Again
    await page.getByText('Play Again').click();

    // Should be back in the lobby
    await expect(page.getByText('Game Mode')).toBeVisible({ timeout: 10_000 });

    // Personalized mode should still be selected — tag picker visible
    await expect(page.getByText('Select at least one tag')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('history')).toBeVisible();
    await expect(page.getByText('geography')).toBeVisible();
  });

  test('Configured (Question Set) mode persists after game-over and Play Again', async ({
    page,
  }) => {
    const helpers = await setupHostedMocks(page);
    await navigateToLobby(page, helpers);

    // Select "Question Set" mode
    await page.getByText('Question Set').click();

    // Set picker should appear with scrollable cards
    await expect(page.getByText('Geography')).toBeVisible({ timeout: 5000 });

    // Simulate a game
    helpers.sendToHost(GAME_STARTING_MSG);
    await page.waitForTimeout(500);
    helpers.sendToHost(QUESTION_MSG);
    await page.waitForTimeout(500);
    helpers.sendToHost(ROUND_END_MSG);
    await page.waitForTimeout(500);
    helpers.sendToHost(GAME_OVER_MSG);

    await expect(page.getByText('Play Again')).toBeVisible({ timeout: 10_000 });
    await page.getByText('Play Again').click();

    // Back in lobby — "Question Set" mode should still be selected
    await expect(page.getByText('Game Mode')).toBeVisible({ timeout: 10_000 });

    // The configured set picker should be visible (not personalized controls)
    await expect(page.getByText('Geography')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Select at least one tag')).not.toBeVisible();
  });
});
