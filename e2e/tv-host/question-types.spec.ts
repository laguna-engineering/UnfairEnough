import { expect, test } from '@playwright/test';
import {
  expectInsideViewport,
  expectNoOverlap,
  gotoPreview,
  previewPlayerNames,
} from './helpers/preview';

/**
 * Each question type has its own QUESTION and RESULTS screen on the TV. They
 * share no layout code, so each one needs its own crowded-room check — the
 * per-player chips and markers are exactly what a 12-player room stresses.
 */

test.describe('multiple choice', () => {
  test('question shows all four options and the answered counter', async ({ page }) => {
    await gotoPreview(page, 'QUESTION', { players: 12, answered: 8 });

    await expect(page.getByText('Question 5 of 10')).toBeVisible();
    await expect(page.getByText('8 / 12 answered')).toBeVisible();
    for (const key of ['A', 'B', 'C', 'D']) {
      await expect(page.getByText(key, { exact: true })).toBeVisible();
    }
  });

  test('results show the correct answer above the leaderboard', async ({ page }) => {
    await gotoPreview(page, 'RESULTS', { players: 12 });

    await expect(page.getByText('Correct Answer')).toBeVisible();
    await expect(page.getByText('Leaderboard')).toBeVisible();
    await expect(page.getByTestId('leaderboard-row')).toHaveCount(12);
  });
});

test.describe('true / false', () => {
  test('question shows both tiles and the answered counter', async ({ page }) => {
    await gotoPreview(page, 'QUESTION', { players: 12, answered: 8, type: 'true_false' });

    await expect(page.getByText('TRUE OR FALSE')).toBeVisible();
    await expect(page.getByText('TRUE', { exact: true })).toBeVisible();
    await expect(page.getByText('FALSE', { exact: true })).toBeVisible();
    await expect(page.getByText('8 / 12 answered')).toBeVisible();
  });

  test('results keep the split tally and full leaderboard on screen', async ({ page }) => {
    await gotoPreview(page, 'RESULTS', { players: 12, type: 'true_false' });

    await expect(page.getByText('Correct Answer')).toBeVisible();
    await expect(page.getByText(/\d+ of 12 picked this/).first()).toBeVisible();

    const rows = page.getByTestId('leaderboard-row');
    await expect(rows).toHaveCount(12);
    await expectInsideViewport(page, rows.last(), 'last leaderboard row');
  });
});

test.describe('closest wins', () => {
  test('question lists a chip per player and marks who locked in', async ({ page }) => {
    await gotoPreview(page, 'QUESTION', { players: 12, answered: 8, type: 'closest_wins' });

    await expect(page.getByText('CLOSEST WINS')).toBeVisible();
    await expect(page.getByText('8 / 12 locked in')).toBeVisible();
    await expect(page.getByText('Somewhere between 0 and 12,000')).toBeVisible();

    // Every player gets a chip, locked in or not — the row must not truncate.
    for (const name of previewPlayerNames(12)) {
      await expect(page.getByText(new RegExp(`^${name}( ✓)?$`))).toBeVisible();
    }
  });

  test('results place every guess on the number line or the outlier strip', async ({ page }) => {
    await gotoPreview(page, 'RESULTS', { players: 12, type: 'closest_wins' });

    await expect(page.getByText('THE ANSWER')).toBeVisible();
    await expect(page.getByText('7,600')).toBeVisible();
    await expect(page.getByText('CLOSEST', { exact: false }).first()).toBeVisible();

    // A guess that renders nowhere is a player whose round vanished.
    for (const name of previewPlayerNames(12)) {
      await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
    }
  });

  test('guess markers stay inside the screen with a full room', async ({ page }) => {
    await gotoPreview(page, 'RESULTS', { players: 12, type: 'closest_wins' });

    for (const name of previewPlayerNames(12)) {
      await expectInsideViewport(
        page,
        page.getByText(name, { exact: true }).first(),
        `${name}'s guess marker`,
      );
    }
  });

  // KNOWN BUG — assignLanes() only has 3 lanes, so a 12-player room stacks
  // chips on top of each other and the covered player's score is unreadable.
  // Remove the test.fail() once the lane count scales with the room.
  test('guess chips do not cover each other', async ({ page }) => {
    test.fail();
    await gotoPreview(page, 'RESULTS', { players: 12, type: 'closest_wins' });

    const chips = page.getByTestId('guess-chip');
    const count = await chips.count();
    await expectNoOverlap(
      Array.from({ length: count }, (_, i) => chips.nth(i)),
      Array.from({ length: count }, (_, i) => `guess chip ${i + 1}`),
    );
  });

  // KNOWN BUG — the answer card is absolutely positioned over the track and
  // lands on top of the question text when the correct value sits mid-range.
  test('the answer card does not cover the question', async ({ page }) => {
    test.fail();
    await gotoPreview(page, 'RESULTS', { players: 12, type: 'closest_wins' });

    await expectNoOverlap(
      [
        page.getByText('How many kilometres of coastline does Italy have?'),
        page.getByText('THE ANSWER'),
      ],
      ['the question', 'the answer card'],
    );
  });
});

test.describe('predict the room', () => {
  test('question tracks votes and predictions separately', async ({ page }) => {
    await gotoPreview(page, 'QUESTION', { players: 12, answered: 8, type: 'predict_room' });

    await expect(page.getByText('PREDICT THE ROOM')).toBeVisible();
    await expect(page.getByText('8 / 12 voted')).toBeVisible();
    // Predictions trail the votes — a player predicts only after voting.
    await expect(page.getByText('6 / 12 predicted')).toBeVisible();
  });

  test('results show the vote split and everyone who called it', async ({ page }) => {
    await gotoPreview(page, 'RESULTS', { players: 12, type: 'predict_room' });

    await expect(page.getByText("ROOM'S PICK")).toBeVisible();
    await expect(page.getByText('Called it:')).toBeVisible();

    // The bars must account for the whole room (each is rounded on its own, so
    // the total can land a point either side of 100).
    const percentages = await page.getByText(/^\d+%$/).allInnerTexts();
    const total = percentages.reduce((sum, pct) => sum + Number.parseInt(pct, 10), 0);
    expect(total).toBeGreaterThanOrEqual(98);
    expect(total).toBeLessThanOrEqual(102);
  });

  test('the "called it" row stays on screen when a third of the room calls it', async ({
    page,
  }) => {
    await gotoPreview(page, 'RESULTS', { players: 12, type: 'predict_room' });

    await expectInsideViewport(page, page.getByText('Called it:'), 'called-it row');
  });
});
