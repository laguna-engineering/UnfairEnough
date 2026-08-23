import { expect, test } from '@playwright/test';
import {
  expectNoHorizontalOverflow,
  gotoPreview,
  PREVIEW_ME,
  previewPlayerNames,
  previewUrl,
} from './helpers/preview';

/**
 * Screen-level checks driven by the preview harness. The WebSocket-driven specs
 * (question-flow, scan-screen) cover what the app *sends*; these cover what each
 * screen *shows*, including the states a real game only reaches after a full
 * round with a full room.
 */

test.describe('Playing a question', () => {
  test('multiple choice shows every option and prompts for a tap', async ({ page }) => {
    await gotoPreview(page, 'PLAY');

    await expect(page.getByText('Tap an answer')).toBeVisible();
    for (const option of ['Buzz Aldrin', 'John Glenn', 'Michael Collins', 'Alan Shepard']) {
      await expect(page.getByText(option)).toBeVisible();
    }
    await expectNoHorizontalOverflow(page);
  });

  test('a submitted answer is acknowledged and locked', async ({ page }) => {
    await gotoPreview(page, 'PLAY', { answered: true });

    // Two confirmations: the banner and the hide-your-screen overlay.
    await expect(page.getByText('Answer submitted!').first()).toBeVisible();
  });

  test('true / false shows the two tiles and the shield warning', async ({ page }) => {
    await gotoPreview(page, 'PLAY', { type: 'true_false' });

    await expect(page.getByText('TRUE', { exact: true })).toBeVisible();
    await expect(page.getByText('FALSE', { exact: true })).toBeVisible();
    await expect(page.getByText(/Shield your screen/i)).toBeVisible();
  });

  test('closest wins shows the slider, the range and the lock-in button', async ({ page }) => {
    await gotoPreview(page, 'PLAY', { type: 'closest_wins' });

    await expect(page.getByText('Somewhere between 0 and 12,000')).toBeVisible();
    await expect(page.getByText('YOUR GUESS')).toBeVisible();
    await expect(page.getByText('Lock it in')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('predict the room shows both steps, vote first', async ({ page }) => {
    await gotoPreview(page, 'PLAY', { type: 'predict_room' });

    await expect(page.getByText('1 · YOUR VOTE')).toBeVisible();
    await expect(page.getByText('2 · PREDICT')).toBeVisible();
    await expect(page.getByText('What do YOU pick?')).toBeVisible();
    await expect(page.getByText(/Your vote is anonymous/i)).toBeVisible();
  });
});

test.describe('Round results', () => {
  test('a correct answer shows the points and the reveal', async ({ page }) => {
    await gotoPreview(page, 'RESULT', { players: 12 });

    await expect(page.getByText('Correct!')).toBeVisible();
    await expect(page.getByText(/\+\d+ points/)).toBeVisible();
    await expect(page.getByText('Michael Collins')).toBeVisible();
    await expect(page.getByText('Your rank: #3')).toBeVisible();
  });

  test('closest wins shows the answer, the guess and the distance', async ({ page }) => {
    await gotoPreview(page, 'RESULT', { players: 12, type: 'closest_wins' });

    await expect(page.getByText('THE ANSWER')).toBeVisible();
    await expect(page.getByText('7,600')).toBeVisible();
    await expect(page.getByText('YOUR GUESS')).toBeVisible();
    await expect(page.getByText('OFF BY')).toBeVisible();
  });

  test('predict the room shows the room pick and keeps votes anonymous', async ({ page }) => {
    await gotoPreview(page, 'RESULT', { players: 12, type: 'predict_room' });

    await expect(page.getByText('THE ROOM PICKED')).toBeVisible();
    await expect(page.getByText(/\d+% of the room/)).toBeVisible();
    await expect(page.getByText(/Votes stay anonymous/i)).toBeVisible();
  });
});

test.describe('Final standings with a full room', () => {
  for (const players of [5, 12]) {
    test(`lists all ${players} players and marks which one is me`, async ({ page }) => {
      await gotoPreview(page, 'GAME_OVER', { players });

      const rows = page.getByTestId('standings-row');
      await expect(rows).toHaveCount(players);

      // Every player must be findable — the standings are the only place the
      // bottom of the room ever sees its result.
      for (const name of previewPlayerNames(players)) {
        await expect(page.getByText(name, { exact: false }).first()).toBeVisible();
      }

      await expect(page.getByText(`${PREVIEW_ME} (You)`)).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });
  }

  test('my finishing place reads as an ordinal, not a bare number', async ({ page }) => {
    await gotoPreview(page, 'GAME_OVER', { players: 12 });

    await expect(page.getByText('You finished 3rd')).toBeVisible();
  });

  test('the Italian place keeps its degree sign', async ({ page }) => {
    // The suffix comes from formatOrdinal, not from the translation string —
    // if the two ever disagree this reads "Sei arrivato 3" or "3°°".
    await page.goto(previewUrl('GAME_OVER', { players: 12, lang: 'it' }));

    await expect(page.getByText('Sei arrivato 3°')).toBeVisible({ timeout: 60_000 });
  });

  test('the last place is reachable by scrolling with a full room', async ({ page }) => {
    await gotoPreview(page, 'GAME_OVER', { players: 12 });

    const lastRow = page.getByTestId('standings-row').last();
    await lastRow.scrollIntoViewIfNeeded();
    await expect(lastRow).toBeVisible();
    await expect(lastRow).toContainText('Lucia');
  });

  test('Play Again stays reachable under a 12-row list', async ({ page }) => {
    await gotoPreview(page, 'GAME_OVER', { players: 12 });

    const playAgain = page.getByText('Play Again');
    await expect(playAgain).toBeVisible();

    const box = await playAgain.boundingBox();
    const viewport = page.viewportSize();
    expect(box, 'Play Again has no layout box').not.toBeNull();
    if (box && viewport) {
      expect(
        box.y + box.height <= viewport.height + 1,
        'Play Again is pushed off the bottom of the screen',
      ).toBe(true);
    }
  });
});

test.describe('Pre-game screens', () => {
  test('the profile picker lists known players and a guest option', async ({ page }) => {
    await gotoPreview(page, 'PICK_PROFILE');

    for (const name of ['Alice', 'Bob', 'Charlie', 'Diana']) {
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    }
    await expect(page.getByText('Play as guest')).toBeVisible();
  });

  test('a returning player sees the host and can disconnect', async ({ page }) => {
    await gotoPreview(page, 'RETURNING');

    await expect(page.getByText('Living room TV')).toBeVisible();
    await expect(page.getByText('Play', { exact: true })).toBeVisible();
    await expect(page.getByText(/Disconnect/i)).toBeVisible();
  });

  test('the waiting screen confirms who you joined as', async ({ page }) => {
    await gotoPreview(page, 'WAITING');

    await expect(page.getByText("You're in!")).toBeVisible();
    await expect(page.getByText('Room: PREV')).toBeVisible();
    await expect(page.getByText(/Waiting for host/i)).toBeVisible();
  });
});
