import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, it } from 'bun:test';
import { createBunAdapter, type DbAdapter } from '../../adapter';
import { configurePragmas, runMigrations } from '../../migrations';
import * as questionsRepo from '../../repositories/questions';
import { validateQuestionSet } from '../validator';

/** Build a question-set object with a single question carrying the given audio block. */
function setWithAudio(audio: unknown, extra: Record<string, unknown> = {}) {
  return {
    name: 'Audio Set',
    questions: [
      {
        text: 'Name that tune?',
        options: [
          { key: 'A', text: 'One' },
          { key: 'B', text: 'Two' },
        ],
        correctAnswer: 'A',
        audio,
        ...extra,
      },
    ],
  };
}

async function freshDb(): Promise<DbAdapter> {
  const db = createBunAdapter(new Database(':memory:'));
  await configurePragmas(db);
  await runMigrations(db);
  return db;
}

describe('audio validation', () => {
  it('defaults play=question, role=background when only url is given', () => {
    const { data, errors } = validateQuestionSet(setWithAudio({ url: 'clip.mp3' }));
    expect(errors).toEqual([]);
    expect(data.questions[0].audio).toEqual({
      url: 'clip.mp3',
      play: 'question',
      role: 'background',
      duration: undefined,
    });
  });

  it('accepts subject+preview (listen-first)', () => {
    const { data, errors } = validateQuestionSet(
      setWithAudio({ url: 'clip.mp3', play: 'preview', role: 'subject', duration: 8 }),
    );
    expect(errors).toEqual([]);
    expect(data.questions[0].audio).toEqual({
      url: 'clip.mp3',
      play: 'preview',
      role: 'subject',
      duration: 8,
    });
  });

  it('accepts subject+question (answer-while-playing)', () => {
    const { errors } = validateQuestionSet(
      setWithAudio({ url: 'clip.mp3', play: 'question', role: 'subject' }),
    );
    expect(errors).toEqual([]);
  });

  it('accepts background+question (background music)', () => {
    const { errors } = validateQuestionSet(
      setWithAudio({ url: 'clip.mp3', play: 'question', role: 'background' }),
    );
    expect(errors).toEqual([]);
  });

  it('rejects background+preview naming the field', () => {
    const { errors } = validateQuestionSet(
      setWithAudio({ url: 'clip.mp3', play: 'preview', role: 'background' }),
    );
    expect(errors.some((e) => e.includes('audio') && e.includes('preview'))).toBe(true);
  });

  it('rejects missing url', () => {
    const { errors } = validateQuestionSet(setWithAudio({ play: 'question' }));
    expect(errors.some((e) => e.includes('audio.url'))).toBe(true);
  });

  it('rejects empty url', () => {
    const { errors } = validateQuestionSet(setWithAudio({ url: '   ' }));
    expect(errors.some((e) => e.includes('audio.url'))).toBe(true);
  });

  it('rejects unknown play value', () => {
    const { errors } = validateQuestionSet(setWithAudio({ url: 'clip.mp3', play: 'loop' }));
    expect(errors.some((e) => e.includes('audio.play'))).toBe(true);
  });

  it('rejects unknown role value', () => {
    const { errors } = validateQuestionSet(setWithAudio({ url: 'clip.mp3', role: 'narrator' }));
    expect(errors.some((e) => e.includes('audio.role'))).toBe(true);
  });
});

describe('audio insert → read round-trip', () => {
  let db: DbAdapter;
  let counter: number;
  const genId = () => `q-${counter++}`;

  beforeEach(async () => {
    db = await freshDb();
    counter = 0;
  });

  it('persists and reads back each valid audio combo', async () => {
    const combos = [
      { url: 'a.mp3', play: 'preview', role: 'subject', duration: 8 },
      { url: 'b.mp3', play: 'question', role: 'subject' },
      { url: 'c.mp3', play: 'question', role: 'background' },
      { url: 'd.mp3' }, // defaults
    ];
    const { data, errors } = validateQuestionSet({
      name: 'Combos',
      questions: combos.map((audio, i) => ({
        text: `Q${i}?`,
        options: [
          { key: 'A', text: 'One' },
          { key: 'B', text: 'Two' },
        ],
        correctAnswer: 'A',
        audio,
      })),
    });
    expect(errors).toEqual([]);

    const setId = await questionsRepo.importQuestionSet(db, 'set-1', data, genId, null);
    const rows = await questionsRepo.getQuestionsBySet(db, setId);

    expect(rows.map((r) => r.audio)).toEqual([
      { url: 'a.mp3', play: 'preview', role: 'subject', duration: 8 },
      { url: 'b.mp3', play: 'question', role: 'subject', duration: undefined },
      { url: 'c.mp3', play: 'question', role: 'background', duration: undefined },
      { url: 'd.mp3', play: 'question', role: 'background', duration: undefined },
    ]);
  });

  it('persists image media and audio together on one question', async () => {
    const { data, errors } = validateQuestionSet(
      setWithAudio(
        { url: 'song.mp3', play: 'question', role: 'subject' },
        { media: { type: 'image', url: 'cover.jpg' } },
      ),
    );
    expect(errors).toEqual([]);

    const setId = await questionsRepo.importQuestionSet(db, 'set-2', data, genId, null);
    const [row] = await questionsRepo.getQuestionsBySet(db, setId);

    expect(row.media).toEqual({ type: 'image', url: 'cover.jpg', previewDuration: 5 });
    expect(row.audio).toEqual({
      url: 'song.mp3',
      play: 'question',
      role: 'subject',
      duration: undefined,
    });
  });

  it('leaves audio null when no audio block is authored', async () => {
    const { data } = validateQuestionSet({
      name: 'No audio',
      questions: [
        {
          text: 'Plain?',
          options: [
            { key: 'A', text: 'One' },
            { key: 'B', text: 'Two' },
          ],
          correctAnswer: 'A',
        },
      ],
    });
    const setId = await questionsRepo.importQuestionSet(db, 'set-3', data, genId, null);
    const [row] = await questionsRepo.getQuestionsBySet(db, setId);
    expect(row.audio).toBeNull();
  });
});
