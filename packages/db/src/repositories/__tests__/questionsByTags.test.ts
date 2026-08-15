import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, it } from 'bun:test';
import { createBunAdapter, type DbAdapter } from '../../adapter';
import { configurePragmas, runMigrations } from '../../migrations';
import * as questionsRepo from '../questions';

async function freshDb(): Promise<DbAdapter> {
  const db = createBunAdapter(new Database(':memory:'));
  await configurePragmas(db);
  await runMigrations(db);
  return db;
}

let idCounter = 0;
const genId = () => `id-${++idCounter}`;

interface SeedQuestion {
  text: string;
  tags: string[];
  language?: string;
}

/** Import a set carrying the given questions. Returns the set id. */
async function seedSet(
  db: DbAdapter,
  opts: {
    name: string;
    hostId: string | null;
    language?: string;
    availableInCasual?: boolean;
    questions: SeedQuestion[];
  },
): Promise<string> {
  const setId = genId();
  await questionsRepo.importQuestionSet(
    db,
    setId,
    {
      name: opts.name,
      language: opts.language ?? 'en',
      availableInCasual: opts.availableInCasual,
      questions: opts.questions.map((q) => ({
        text: q.text,
        tags: q.tags,
        language: q.language,
        options: [
          { key: 'A', text: 'One' },
          { key: 'B', text: 'Two' },
        ],
        correctAnswer: 'A',
      })),
    },
    genId,
    opts.hostId,
  );
  return setId;
}

describe('getQuestionsByTags', () => {
  beforeEach(() => {
    idCounter = 0;
  });

  it('returns the union of the given tags (a question is included if it has any of them)', async () => {
    const db = await freshDb();
    await seedSet(db, {
      name: 'Set',
      hostId: null,
      questions: [
        { text: 'only history', tags: ['history'] },
        { text: 'only geography', tags: ['geography'] },
        { text: 'both', tags: ['history', 'geography'] },
        { text: 'unrelated', tags: ['sports'] },
      ],
    });

    const result = await questionsRepo.getQuestionsByTags(db, ['history', 'geography'], {
      hostId: null,
    });

    const texts = result.map((q) => q.text).sort();
    expect(texts).toEqual(['both', 'only geography', 'only history']);
    // 'both' appears exactly once even though it matches two tags
    expect(result.filter((q) => q.text === 'both')).toHaveLength(1);
  });

  it('returns [] for an empty tag list without querying', async () => {
    const db = await freshDb();
    await seedSet(db, {
      name: 'Set',
      hostId: null,
      questions: [{ text: 'q', tags: ['history'] }],
    });

    expect(await questionsRepo.getQuestionsByTags(db, [], { hostId: null })).toEqual([]);
  });

  it('filters by language', async () => {
    const db = await freshDb();
    await seedSet(db, {
      name: 'EN',
      hostId: null,
      language: 'en',
      questions: [{ text: 'english', tags: ['history'], language: 'en' }],
    });
    await seedSet(db, {
      name: 'IT',
      hostId: null,
      language: 'it',
      questions: [{ text: 'italian', tags: ['history'], language: 'it' }],
    });

    const en = await questionsRepo.getQuestionsByTags(db, ['history'], {
      hostId: null,
      language: 'en',
    });
    expect(en.map((q) => q.text)).toEqual(['english']);
  });

  it('scopes to the host (other hosts excluded)', async () => {
    const db = await freshDb();
    // hosts must exist for host_id FK-style scoping via question_sets.host_id
    await db.run(
      "INSERT INTO hosts (id, email, password_hash, display_name) VALUES ('h1','a@x','_','A'),('h2','b@x','_','B')",
    );
    await seedSet(db, {
      name: 'Mine',
      hostId: 'h1',
      questions: [{ text: 'mine', tags: ['history'] }],
    });
    await seedSet(db, {
      name: 'Theirs',
      hostId: 'h2',
      questions: [{ text: 'theirs', tags: ['history'] }],
    });

    const result = await questionsRepo.getQuestionsByTags(db, ['history'], { hostId: 'h1' });
    expect(result.map((q) => q.text)).toEqual(['mine']);
  });

  it('excludes soft-deleted and casual-hidden sets', async () => {
    const db = await freshDb();
    const deleted = await seedSet(db, {
      name: 'Deleted',
      hostId: null,
      questions: [{ text: 'deleted', tags: ['history'] }],
    });
    await seedSet(db, {
      name: 'Hidden',
      hostId: null,
      availableInCasual: false,
      questions: [{ text: 'hidden', tags: ['history'] }],
    });
    await seedSet(db, {
      name: 'Live',
      hostId: null,
      questions: [{ text: 'live', tags: ['history'] }],
    });
    await db.run("UPDATE question_sets SET deleted_at = datetime('now') WHERE id = ?", [deleted]);

    const result = await questionsRepo.getQuestionsByTags(db, ['history'], { hostId: null });
    expect(result.map((q) => q.text)).toEqual(['live']);
  });
});

describe('getTagsWithCounts', () => {
  beforeEach(() => {
    idCounter = 0;
  });

  it("a tag's count equals the pool getQuestionsByTags loads for it (R9)", async () => {
    const db = await freshDb();
    await seedSet(db, {
      name: 'Set',
      hostId: null,
      questions: [
        { text: 'h1', tags: ['history'] },
        { text: 'h2', tags: ['history', 'geography'] },
        { text: 'g1', tags: ['geography'] },
      ],
    });

    const tags = await questionsRepo.getTagsWithCounts(db, null);
    const history = tags.find((t) => t.tag === 'history');
    expect(history?.questionCount).toBe(2);

    const pool = await questionsRepo.getQuestionsByTags(db, ['history'], { hostId: null });
    expect(pool).toHaveLength(history!.questionCount);
  });

  it('excludes casual-hidden sets from counts (matches the pool predicate)', async () => {
    const db = await freshDb();
    await seedSet(db, {
      name: 'Hidden',
      hostId: null,
      availableInCasual: false,
      questions: [{ text: 'hidden', tags: ['history'] }],
    });
    const tags = await questionsRepo.getTagsWithCounts(db, null);
    expect(tags.find((t) => t.tag === 'history')).toBeUndefined();
  });
});

describe('migration V18', () => {
  it('adds games.tags', async () => {
    const db = await freshDb();
    const cols = await db.all<{ name: string }>('PRAGMA table_info(games)');
    expect(cols.map((c) => c.name)).toContain('tags');
  });
});

describe('migration V19', () => {
  it('brings user_version to 19 and adds the closest_wins range columns', async () => {
    const db = await freshDb();
    const version = await db.get<{ user_version: number }>('PRAGMA user_version');
    expect(version?.user_version).toBe(19);

    const cols = await db.all<{ name: string }>('PRAGMA table_info(questions)');
    const colNames = cols.map((c) => c.name);
    expect(colNames).toContain('range_min');
    expect(colNames).toContain('range_max');
    expect(colNames).toContain('range_step');
  });
});
