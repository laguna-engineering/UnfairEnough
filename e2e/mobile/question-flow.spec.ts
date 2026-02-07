import { test, expect, type Page, type WebSocketRoute } from '@playwright/test';

const WELCOME_MSG = JSON.stringify({
  type: 'WELCOME',
  payload: { playerId: 'p1', playerColor: '#ff00ff', roomCode: 'TEST' },
});

const QUESTION_MSG = JSON.stringify({
  type: 'QUESTION',
  payload: {
    id: 'q1',
    text: 'What is the capital of Japan?',
    options: [
      { key: 'A', text: 'Tokyo' },
      { key: 'B', text: 'Osaka' },
      { key: 'C', text: 'Kyoto' },
      { key: 'D', text: 'Nagoya' },
    ],
    timeLimit: 15,
    questionNumber: 1,
    totalQuestions: 5,
    serverTimestamp: Date.now(),
  },
});

const QUESTION_2_MSG = JSON.stringify({
  type: 'QUESTION',
  payload: {
    id: 'q2',
    text: 'What is the largest planet?',
    options: [
      { key: 'A', text: 'Mars' },
      { key: 'B', text: 'Jupiter' },
      { key: 'C', text: 'Saturn' },
      { key: 'D', text: 'Neptune' },
    ],
    timeLimit: 15,
    questionNumber: 2,
    totalQuestions: 5,
    serverTimestamp: Date.now(),
  },
});

const ROUND_END_MSG = JSON.stringify({
  type: 'ROUND_END',
  payload: {
    questionId: 'q1',
    correctAnswer: 'A',
    playerResults: [
      {
        playerId: 'p1',
        name: 'Player1',
        answer: 'A',
        isCorrect: true,
        responseTimeMs: 2000,
        pointsEarned: 800,
        totalScore: 800,
      },
    ],
    rankings: [{ playerId: 'p1', name: 'Player1', score: 800, rank: 1 }],
  },
});

const ANSWER_ACK_MSG = (questionId: string) =>
  JSON.stringify({
    type: 'ANSWER_ACK',
    payload: { questionId, serverReceivedAt: Date.now() },
  });

/**
 * Sets up a mock WebSocket server that intercepts the app's WS connection.
 * Returns helpers to inspect client messages and push server messages.
 */
async function setupMockWs(page: Page) {
  const clientMessages: Array<{ type: string; payload?: unknown }> = [];
  let wsRoute: WebSocketRoute | null = null;

  await page.routeWebSocket(/ws:\/\/localhost:8080/, (ws) => {
    wsRoute = ws;
    ws.onMessage((raw) => {
      const msg = JSON.parse(raw as string);
      clientMessages.push(msg);
    });
  });

  const sendToClient = (data: string) => {
    if (!wsRoute) throw new Error('WebSocket not connected yet');
    wsRoute.send(data);
  };

  const waitForMessages = async (n: number, timeoutMs = 5000) => {
    const deadline = Date.now() + timeoutMs;
    while (clientMessages.length < n && Date.now() < deadline) {
      await page.waitForTimeout(100);
    }
  };

  return { clientMessages, sendToClient, waitForMessages };
}

/**
 * Navigate from ScanScreen → enter code → enter IP → connect.
 * Then join with the given name and wait for the WaitingScreen.
 */
async function joinGame(
  page: Page,
  helpers: Awaited<ReturnType<typeof setupMockWs>>,
  playerName: string,
) {
  await page.goto('/');

  // ScanScreen: enter room code and advance
  await page.getByPlaceholder('XXXX').fill('TEST');
  await page.getByText('Next').click();

  // IP screen: leave blank (localhost), click Connect
  await expect(page.getByPlaceholder('localhost or 192.168.x.x')).toBeVisible();
  await page.getByText('Connect').click();

  // JoinScreen: enter name, click the Join Game *button* (not the title).
  // "Join Game" appears twice: once as the screen title, once as the button text.
  // The button is the last match in DOM order.
  await expect(page.getByText("What's your name?")).toBeVisible({ timeout: 5000 });
  await page.getByPlaceholder('Your name').fill(playerName);
  await page.getByText('Join Game').last().click();

  // Verify JOIN was sent
  await helpers.waitForMessages(1);
  expect(helpers.clientMessages[0]).toEqual(
    expect.objectContaining({
      type: 'JOIN',
      payload: expect.objectContaining({ name: playerName }),
    }),
  );

  // Server replies with WELCOME → WaitingScreen
  helpers.sendToClient(WELCOME_MSG);
  await expect(page.getByText("You're in!")).toBeVisible({ timeout: 5000 });
}

test.describe('Question submission flow', () => {
  test('displays question and submits answer via WebSocket', async ({ page }) => {
    const helpers = await setupMockWs(page);
    const { clientMessages, sendToClient, waitForMessages } = helpers;

    await joinGame(page, helpers, 'Player1');

    // Server sends QUESTION → PlayScreen renders
    sendToClient(QUESTION_MSG);

    // PlayScreen shows answer options (not the question text — that's on TV only)
    await expect(page.getByText('Tokyo')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Osaka')).toBeVisible();
    await expect(page.getByText('Kyoto')).toBeVisible();
    await expect(page.getByText('Nagoya')).toBeVisible();

    // Verify question counter and initial hint
    await expect(page.getByText('1 / 5')).toBeVisible();
    await expect(page.getByText('Tap an answer')).toBeVisible();

    // Tap "Tokyo" (answer A) — submits immediately
    const msgCountBefore = clientMessages.length;
    await page.getByText('Tokyo').click();

    // Verify ANSWER message was sent
    await waitForMessages(msgCountBefore + 1);
    const answerMsg = clientMessages[clientMessages.length - 1];
    expect(answerMsg).toEqual({
      type: 'ANSWER',
      payload: { questionId: 'q1', answer: 'A' },
    });

    // Server acknowledges
    sendToClient(ANSWER_ACK_MSG('q1'));
    await expect(page.getByText('Answer submitted!')).toBeVisible({ timeout: 5000 });
  });

  test('tapping an answer submits it immediately', async ({ page }) => {
    const helpers = await setupMockWs(page);
    const { clientMessages, waitForMessages } = helpers;

    await joinGame(page, helpers, 'Player2');

    helpers.sendToClient(QUESTION_MSG);
    await expect(page.getByText('Tokyo')).toBeVisible({ timeout: 5000 });

    // Single tap on Kyoto (C) submits immediately
    const msgCountBefore = clientMessages.length;
    await page.getByText('Kyoto').click();

    await waitForMessages(msgCountBefore + 1);
    const answerMsg = clientMessages[clientMessages.length - 1];
    expect(answerMsg).toEqual({
      type: 'ANSWER',
      payload: { questionId: 'q1', answer: 'C' },
    });
  });

  test('cannot change answer after confirmation', async ({ page }) => {
    const helpers = await setupMockWs(page);
    const { clientMessages, sendToClient, waitForMessages } = helpers;

    await joinGame(page, helpers, 'Player3');

    sendToClient(QUESTION_MSG);
    await expect(page.getByText('Tokyo')).toBeVisible({ timeout: 5000 });

    // Submit Tokyo (A)
    await page.getByText('Tokyo').click();
    await waitForMessages(2); // JOIN + ANSWER

    sendToClient(ANSWER_ACK_MSG('q1'));
    await expect(page.getByText('Answer submitted!')).toBeVisible({ timeout: 5000 });

    // Try clicking another answer — should not send another ANSWER message
    const msgCountAfterConfirm = clientMessages.length;
    await page.getByText('Osaka').click();

    // Brief wait to ensure no extra message is sent
    await page.waitForTimeout(500);
    expect(clientMessages.length).toBe(msgCountAfterConfirm);
  });

  test('question options update when a new round starts', async ({ page }) => {
    const helpers = await setupMockWs(page);
    const { sendToClient } = helpers;

    await joinGame(page, helpers, 'Player4');

    // Round 1: server sends first question
    sendToClient(QUESTION_MSG);
    await expect(page.getByText('Tokyo')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Osaka')).toBeVisible();
    await expect(page.getByText('1 / 5')).toBeVisible();

    // Player answers and server sends round results
    await page.getByText('Tokyo').click();
    sendToClient(ANSWER_ACK_MSG('q1'));
    await expect(page.getByText('Answer submitted!')).toBeVisible({ timeout: 5000 });

    sendToClient(ROUND_END_MSG);
    // ResultScreen should appear
    await expect(page.getByText('Correct!')).toBeVisible({ timeout: 5000 });

    // Round 2: server sends new question with different options
    sendToClient(QUESTION_2_MSG);

    // Old options should be gone, new options visible
    await expect(page.getByText('Jupiter')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Mars')).toBeVisible();
    await expect(page.getByText('Saturn')).toBeVisible();
    await expect(page.getByText('Neptune')).toBeVisible();
    await expect(page.getByText('2 / 5')).toBeVisible();

    // Old options from round 1 should not be visible
    await expect(page.getByText('Tokyo')).not.toBeVisible();
    await expect(page.getByText('Osaka')).not.toBeVisible();
  });
});
