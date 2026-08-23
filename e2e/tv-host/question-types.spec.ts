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
 *
 * Results screens come in two shapes: up to five players everyone is named on
 * the TV, above that the at-scale layouts take over and the individual result
 * moves to the phone. Both shapes are exercised here.
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

  test('a small room puts every guess on the number line', async ({ page }) => {
    await gotoPreview(page, 'RESULTS', { players: 5, type: 'closest_wins' });

    await expect(page.getByText('THE ANSWER')).toBeVisible();
    await expect(page.getByText('7,600')).toBeVisible();
    await expect(page.getByText('CLOSEST', { exact: false }).first()).toBeVisible();

    // A guess that renders nowhere is a player whose round vanished.
    for (const name of previewPlayerNames(5)) {
      await expectInsideViewport(
        page,
        page.getByText(name, { exact: true }).first(),
        `${name}'s guess marker`,
      );
    }
  });

  test('a crowded room banks the guesses instead of stacking chips', async ({ page }) => {
    await gotoPreview(page, 'RESULTS', { players: 12, type: 'closest_wins' });

    // The number line is gone — labelled chips per guess is what used to stack
    // players on top of each other and hide their scores.
    await expect(page.getByTestId('guess-chip')).toHaveCount(0);

    // Five bands, and between them they hold every single guess.
    const bands = page.getByTestId('proximity-band');
    await expect(bands).toHaveCount(5);
    const counts = await page.getByTestId('band-count').allInnerTexts();
    const banded = counts.reduce((sum, text) => sum + Number.parseInt(text, 10), 0);
    expect(banded).toBe(12);

    // Only the closest few get named, and their rows must not overlap.
    const rows = page.getByTestId('closest-row');
    await expect(rows).toHaveCount(5);
    const count = await rows.count();
    await expectNoOverlap(
      Array.from({ length: count }, (_, i) => rows.nth(i)),
      Array.from({ length: count }, (_, i) => `closest row ${i + 1}`),
    );
  });

  test('the crowded-room answer does not cover the question', async ({ page }) => {
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

  test('a small room shows the vote split and names who called it', async ({ page }) => {
    await gotoPreview(page, 'RESULTS', { players: 5, type: 'predict_room' });

    await expect(page.getByText("ROOM'S PICK")).toBeVisible();
    await expectInsideViewport(page, page.getByText('Called it:'), 'called-it row');

    // The bars must account for the whole room (each is rounded on its own, so
    // the total can land a point either side of 100).
    const percentages = await page.getByText(/^\d+%$/).allInnerTexts();
    const total = percentages.reduce((sum, pct) => sum + Number.parseInt(pct, 10), 0);
    expect(total).toBeGreaterThanOrEqual(98);
    expect(total).toBeLessThanOrEqual(102);
  });

  test('a crowded room shows one anonymous dot per vote', async ({ page }) => {
    await gotoPreview(page, 'RESULTS', { players: 12, type: 'predict_room' });

    await expect(page.getByText("ROOM'S PICK")).toBeVisible();

    // Votes are anonymous by protocol, so the crowd is the whole reading: one
    // dot per vote, and every vote in the room accounted for.
    await expect(page.getByTestId('predict-option-column')).toHaveCount(4);
    await expect(page.getByTestId('predict-vote-dot')).toHaveCount(12);

    // Nobody who called it gets named on the TV — only counted.
    await expect(page.getByText('4 players called it')).toBeVisible();
    await expectInsideViewport(page, page.getByText('4 players called it'), 'called-it pill');
  });
});
