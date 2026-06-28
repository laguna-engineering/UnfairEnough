import {
  configurePragmas,
  createExpoAdapter,
  type DbAdapter,
  type QuestionSetInput,
  questionsRepo,
  runMigrations,
} from '@unfairenough/db';
import * as Crypto from 'expo-crypto';

let db: DbAdapter | null = null;

/**
 * Initialize the local SQLite database for question storage.
 * Runs migrations and seeds sample questions if the DB is empty.
 *
 * tvOS note: databases are stored in the caches directory which
 * may be purged under storage pressure. Migrations are idempotent
 * and sample questions are re-seeded on startup if needed.
 */
export async function initDatabase(): Promise<DbAdapter> {
  if (db) return db;

  // Lazy require: expo-sqlite uses native modules unavailable on web
  const SQLite = require('expo-sqlite');
  const sqlite = await SQLite.openDatabaseAsync('unfairenough.db');
  db = createExpoAdapter(sqlite);

  await configurePragmas(db);
  await runMigrations(db);

  // Seed sample questions if DB is empty
  const count = await questionsRepo.getTotalQuestionCount(db);
  if (count === 0) {
    await seedSampleQuestions(db);
  }

  return db;
}

export function getDb(): DbAdapter {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}

async function seedSampleQuestions(db: DbAdapter): Promise<void> {
  const sampleSet: QuestionSetInput = {
    name: 'General Trivia',
    author: 'Unfair Enough!',
    description: 'A mix of general knowledge questions',
    defaultTimeLimit: 10,
    tags: ['general', 'trivia'],
    questions: [
      {
        id: 'sample-1',
        type: 'multiple_choice',
        text: 'What is the capital of Japan?',
        category: 'geography',
        options: [
          { key: 'A', text: 'Kyoto' },
          { key: 'B', text: 'Osaka' },
          { key: 'C', text: 'Tokyo' },
          { key: 'D', text: 'Nagoya' },
        ],
        correctAnswer: 'C',
      },
      {
        id: 'sample-2',
        type: 'multiple_choice',
        text: 'Which planet is known as the Red Planet?',
        category: 'science',
        options: [
          { key: 'A', text: 'Venus' },
          { key: 'B', text: 'Mars' },
          { key: 'C', text: 'Jupiter' },
          { key: 'D', text: 'Saturn' },
        ],
        correctAnswer: 'B',
      },
      {
        id: 'sample-3',
        type: 'multiple_choice',
        text: 'What is the largest mammal on Earth?',
        category: 'science',
        options: [
          { key: 'A', text: 'African Elephant' },
          { key: 'B', text: 'Blue Whale' },
          { key: 'C', text: 'Giraffe' },
          { key: 'D', text: 'Polar Bear' },
        ],
        correctAnswer: 'B',
      },
      {
        id: 'sample-4',
        type: 'multiple_choice',
        text: 'In what year did World War II end?',
        category: 'history',
        options: [
          { key: 'A', text: '1943' },
          { key: 'B', text: '1944' },
          { key: 'C', text: '1945' },
          { key: 'D', text: '1946' },
        ],
        correctAnswer: 'C',
      },
      {
        id: 'sample-5',
        type: 'multiple_choice',
        text: 'Who painted the Mona Lisa?',
        category: 'art',
        options: [
          { key: 'A', text: 'Michelangelo' },
          { key: 'B', text: 'Raphael' },
          { key: 'C', text: 'Vincent van Gogh' },
          { key: 'D', text: 'Leonardo da Vinci' },
        ],
        correctAnswer: 'D',
      },
      {
        id: 'sample-6',
        type: 'multiple_choice',
        text: 'What is the chemical symbol for gold?',
        category: 'science',
        options: [
          { key: 'A', text: 'Go' },
          { key: 'B', text: 'Gd' },
          { key: 'C', text: 'Au' },
          { key: 'D', text: 'Ag' },
        ],
        correctAnswer: 'C',
      },
      {
        id: 'sample-7',
        type: 'multiple_choice',
        text: 'Which country has the most people?',
        category: 'geography',
        options: [
          { key: 'A', text: 'India' },
          { key: 'B', text: 'United States' },
          { key: 'C', text: 'Indonesia' },
          { key: 'D', text: 'Brazil' },
        ],
        correctAnswer: 'A',
      },
      {
        id: 'sample-8',
        type: 'multiple_choice',
        text: 'What is the fastest land animal?',
        category: 'science',
        options: [
          { key: 'A', text: 'Lion' },
          { key: 'B', text: 'Cheetah' },
          { key: 'C', text: 'Horse' },
          { key: 'D', text: 'Gazelle' },
        ],
        correctAnswer: 'B',
      },
      {
        id: 'sample-9',
        type: 'multiple_choice',
        text: 'How many continents are there on Earth?',
        category: 'geography',
        options: [
          { key: 'A', text: '5' },
          { key: 'B', text: '6' },
          { key: 'C', text: '7' },
          { key: 'D', text: '8' },
        ],
        correctAnswer: 'C',
      },
      {
        id: 'sample-10',
        type: 'multiple_choice',
        text: 'What is the square root of 144?',
        category: 'math',
        options: [
          { key: 'A', text: '10' },
          { key: 'B', text: '11' },
          { key: 'C', text: '12' },
          { key: 'D', text: '14' },
        ],
        correctAnswer: 'C',
      },
      {
        id: 'sample-11',
        type: 'multiple_choice',
        text: 'Which element has the atomic number 1?',
        category: 'science',
        options: [
          { key: 'A', text: 'Helium' },
          { key: 'B', text: 'Hydrogen' },
          { key: 'C', text: 'Lithium' },
          { key: 'D', text: 'Carbon' },
        ],
        correctAnswer: 'B',
      },
      {
        id: 'sample-12',
        type: 'multiple_choice',
        text: 'In which city is the Colosseum located?',
        category: 'geography',
        options: [
          { key: 'A', text: 'Athens' },
          { key: 'B', text: 'Rome' },
          { key: 'C', text: 'Paris' },
          { key: 'D', text: 'Madrid' },
        ],
        correctAnswer: 'B',
      },
    ],
  };

  await questionsRepo.importQuestionSet(
    db,
    Crypto.randomUUID(),
    sampleSet,
    () => Crypto.randomUUID(),
    null,
  );
  console.log('Seeded 12 sample questions into local database');
}
