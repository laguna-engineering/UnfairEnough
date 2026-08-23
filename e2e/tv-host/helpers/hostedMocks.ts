import { expect, type Page, type WebSocketRoute } from '@playwright/test';

/**
 * Mocks for the *hosted* TV flow: the app connects to a Bun server over a
 * WebSocket and the server drives every phase. Unlike the preview harness
 * (helpers/preview.ts), this exercises the real HostedGameController and the
 * game-logic reducers, so it is the right tool for connection and lobby flows.
 */

export const MOCK_QUESTION_SETS = {
  sets: [
    { id: 'set-1', name: 'Geography', questionCount: 10, isMeta: false, language: 'en' },
    { id: 'set-2', name: 'Science', questionCount: 8, isMeta: false, language: 'en' },
    { id: 'meta-1', name: 'All Questions', questionCount: 18, isMeta: true, language: 'en' },
  ],
};

export const MOCK_TAGS = {
  tags: [
    { tag: 'history', questionCount: 12, playerCount: 0 },
    { tag: 'geography', questionCount: 9, playerCount: 0 },
  ],
  totalPlayers: 0,
};

export const ROOM_CREATED_MSG = JSON.stringify({
  type: 'ROOM_CREATED',
  payload: { roomCode: 'TEST' },
});

export const GAME_CONFIGURED_PERSONALIZED_MSG = JSON.stringify({
  type: 'GAME_CONFIGURED',
  payload: {
    gameType: 'personalized',
    tags: ['history', 'geography'],
    adaptiveMode: true,
    questionCount: 10,
  },
});

export const GAME_CONFIGURED_SET_MSG = JSON.stringify({
  type: 'GAME_CONFIGURED',
  payload: { gameType: 'configured', questionSetId: 'set-1', questionCount: 10 },
});

export const GAME_STARTING_MSG = JSON.stringify({
  type: 'GAME_STARTING',
  payload: { countdown: 3 },
});

export const QUESTION_MSG = JSON.stringify({
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

export const REVEALING_MSG = JSON.stringify({ type: 'REVEALING', payload: {} });

export const ROUND_END_MSG = JSON.stringify({
  type: 'ROUND_END',
  payload: {
    questionId: 'q1',
    correctAnswer: 'B',
    playerResults: [],
    rankings: [],
    tags: ['math'],
  },
});

export const GAME_OVER_MSG = JSON.stringify({ type: 'GAME_OVER', payload: {} });

/** Colors and emoji the server hands out, cycled so joins look like a real room. */
const PLAYER_COLORS = ['#FF6B9D', '#4ECDC4', '#FFE66D', '#AA96DA', '#FF8A65', '#81C784'];
const PLAYER_EMOJI = ['🦊', '🐙', '🦄', '🐲', '🦁', '🐸'];

export function playerJoinedMsg(index: number, name: string): string {
  return JSON.stringify({
    type: 'PLAYER_JOINED',
    payload: {
      playerId: `p${index + 1}`,
      name,
      color: PLAYER_COLORS[index % PLAYER_COLORS.length],
      emoji: PLAYER_EMOJI[index % PLAYER_EMOJI.length],
    },
  });
}

export function playerLeftMsg(playerId: string): string {
  return JSON.stringify({ type: 'PLAYER_LEFT', payload: { playerId } });
}

export interface HostedMocks {
  /** Every message the TV sent to the server, PINGs filtered out. */
  clientMessages: Array<{ type: string; payload?: unknown }>;
  sendToHost: (data: string) => void;
  waitForWs: (timeoutMs?: number) => Promise<void>;
}

/**
 * Route mocks for the hosted server's health check, question sets and tags API,
 * plus an intercepted host WebSocket the test drives by hand.
 */
export async function setupHostedMocks(page: Page): Promise<HostedMocks> {
  const clientMessages: Array<{ type: string; payload?: unknown }> = [];
  let wsRoute: WebSocketRoute | null = null;

  await page.route('**/api/health', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok', lanIp: 'localhost', port: 3000 }),
    }),
  );

  await page.route('**/api/question-sets*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_QUESTION_SETS),
    }),
  );

  await page.route('**/api/tags*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_TAGS),
    }),
  );

  await page.routeWebSocket(/ws:\/\/localhost(:\d+)?\/ws/, (ws) => {
    wsRoute = ws;
    ws.onMessage((raw) => {
      const msg = JSON.parse(raw as string);
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
 * Navigate from ConnectScreen → lobby by connecting to the mock server.
 * `?lang=en` pins the copy the assertions below expect, whatever DEFAULT_LANG
 * the dev server was built with.
 */
export async function navigateToLobby(page: Page, helpers: HostedMocks): Promise<void> {
  await page.goto('/?lang=en');

  const input = page.getByPlaceholder('192.168.1.100:3000');
  await expect(input).toBeVisible({ timeout: 60_000 });
  await input.fill('localhost:3000');
  // Exact — the screen title is "Connect to Server".
  await page.getByText('Connect', { exact: true }).click();

  await helpers.waitForWs();
  helpers.sendToHost(ROOM_CREATED_MSG);

  await expect(page.getByText('Game Mode')).toBeVisible({ timeout: 10_000 });
}

/**
 * Play a whole game in fast-forward. The phase order matters: the reducer only
 * accepts QUESTION → REVEALING → RESULTS, so skipping REVEALING leaves the TV
 * stuck on the question with every later message silently dropped.
 */
export async function playThroughGame(page: Page, helpers: HostedMocks): Promise<void> {
  helpers.sendToHost(GAME_STARTING_MSG);
  await page.waitForTimeout(500);
  helpers.sendToHost(QUESTION_MSG);
  await page.waitForTimeout(500);
  helpers.sendToHost(REVEALING_MSG);
  await page.waitForTimeout(300);
  helpers.sendToHost(ROUND_END_MSG);
  await page.waitForTimeout(500);
  helpers.sendToHost(GAME_OVER_MSG);
}
