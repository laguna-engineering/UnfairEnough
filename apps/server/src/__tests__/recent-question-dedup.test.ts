import { beforeEach, describe, expect, it } from 'bun:test';
import type { DbAdapter } from '@unfairenough/db';
import { GameRoom } from '../room';

// The cross-game pool filter itself lives in @unfairenough/game-logic
// (filterRecentlyServedQuestions) and is tested there. This file covers the room's
// own bookkeeping: how it remembers served question IDs across games.

function createMockDb(): DbAdapter {
  return {
    async run() {
      return { changes: 0, lastInsertRowid: 0 };
    },
    async all() {
      return [];
    },
    async get() {
      return null;
    },
    async exec() {},
    async transaction<T>(fn: () => Promise<T>) {
      return fn();
    },
  };
}

// recordServedQuestion is private; access via cast, consistent with the other
// test files in this directory.
describe('GameRoom recently-served question tracking', () => {
  let room: any;

  beforeEach(() => {
    room = new GameRoom('TEST', createMockDb(), null);
  });

  it('records served IDs in recency order, de-duplicated', () => {
    room.recordServedQuestion('a');
    room.recordServedQuestion('b');
    room.recordServedQuestion('a'); // re-serving moves 'a' to most-recent
    expect(room.recentlyServedQuestionIds).toEqual(['b', 'a']);
  });

  it('bounds the remembered IDs and keeps the most recent', () => {
    for (let i = 0; i < 600; i++) room.recordServedQuestion(`q${i}`);
    expect(room.recentlyServedQuestionIds.length).toBe(500);
    expect(room.recentlyServedQuestionIds[0]).toBe('q100'); // oldest 100 dropped
    expect(room.recentlyServedQuestionIds.at(-1)).toBe('q599');
  });
});
