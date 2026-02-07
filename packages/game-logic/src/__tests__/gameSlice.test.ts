import { describe, expect, test } from 'bun:test';
import {
  createStore,
  nextQuestion,
  setCountdown,
  showMediaPreview,
  showQuestion,
  showRoundResults,
  startGameCountdown,
  startRevealing,
} from '../index';

function makeQuestion(id: string, text: string, questionNumber: number) {
  return {
    id,
    text,
    options: [
      { key: 'A' as const, text: `${text} - A` },
      { key: 'B' as const, text: `${text} - B` },
      { key: 'C' as const, text: `${text} - C` },
      { key: 'D' as const, text: `${text} - D` },
    ],
    timeLimit: 10,
    questionNumber,
    totalQuestions: 3,
    serverTimestamp: Date.now(),
  };
}

/** Walk the store through LOBBY → COUNTDOWN → QUESTION with question 1 */
function advanceToFirstQuestion(store: ReturnType<typeof createStore>) {
  store.dispatch(startGameCountdown());
  store.dispatch(setCountdown(0));
  const q1 = makeQuestion('q1', 'First question', 1);
  store.dispatch(showQuestion(q1));
  return q1;
}

/** Walk the store from QUESTION → REVEALING → RESULTS */
function advanceToResults(store: ReturnType<typeof createStore>) {
  store.dispatch(startRevealing());
  store.dispatch(showRoundResults({ results: [], rankings: [] }));
}

describe('gameSlice question transitions', () => {
  test('nextQuestion → showQuestion updates currentQuestion', () => {
    const store = createStore();
    const _q1 = advanceToFirstQuestion(store);

    expect(store.getState().game.currentQuestion?.id).toBe('q1');
    expect(store.getState().game.currentQuestion?.text).toBe('First question');

    advanceToResults(store);
    expect(store.getState().game.phase).toBe('RESULTS');

    // Advance to next question (this is what GameController does)
    store.dispatch(nextQuestion());
    const q2 = makeQuestion('q2', 'Second question', 2);
    store.dispatch(showQuestion(q2));

    expect(store.getState().game.phase).toBe('QUESTION');
    expect(store.getState().game.currentQuestion?.id).toBe('q2');
    expect(store.getState().game.currentQuestion?.text).toBe('Second question');
  });

  test('nextQuestion → showMediaPreview → showQuestion updates currentQuestion', () => {
    const store = createStore();
    advanceToFirstQuestion(store);
    advanceToResults(store);

    store.dispatch(nextQuestion());
    store.dispatch(
      showMediaPreview({
        questionNumber: 2,
        totalQuestions: 3,
        media: { type: 'image', url: 'https://example.com/img.jpg' },
        duration: 5,
      }),
    );

    expect(store.getState().game.phase).toBe('MEDIA_PREVIEW');

    const q2 = makeQuestion('q2', 'Second question', 2);
    store.dispatch(showQuestion(q2));

    expect(store.getState().game.phase).toBe('QUESTION');
    expect(store.getState().game.currentQuestion?.id).toBe('q2');
    expect(store.getState().game.currentQuestion?.text).toBe('Second question');
  });

  test('question updates across three rounds', () => {
    const store = createStore();

    // Round 1
    advanceToFirstQuestion(store);
    expect(store.getState().game.currentQuestion?.text).toBe('First question');
    advanceToResults(store);

    // Round 2
    store.dispatch(nextQuestion());
    store.dispatch(showQuestion(makeQuestion('q2', 'Second question', 2)));
    expect(store.getState().game.currentQuestion?.text).toBe('Second question');
    advanceToResults(store);

    // Round 3
    store.dispatch(nextQuestion());
    store.dispatch(showQuestion(makeQuestion('q3', 'Third question', 3)));
    expect(store.getState().game.currentQuestion?.text).toBe('Third question');
  });
});
