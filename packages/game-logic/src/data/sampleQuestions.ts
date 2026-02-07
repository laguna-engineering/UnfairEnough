import type { Question, AnswerKey } from '@unfairenough/ws-protocol';

export interface QuestionWithAnswer extends Omit<Question, 'questionNumber' | 'totalQuestions' | 'timeLimit'> {
  correctAnswer: AnswerKey;
}

export const sampleQuestions: QuestionWithAnswer[] = [
  {
    id: '1',
    text: 'What is the capital of Japan?',
    options: [
      { key: 'A', text: 'Kyoto' },
      { key: 'B', text: 'Osaka' },
      { key: 'C', text: 'Tokyo' },
      { key: 'D', text: 'Nagoya' },
    ],
    correctAnswer: 'C',
  },
  {
    id: '2',
    text: 'Which planet is known as the Red Planet?',
    options: [
      { key: 'A', text: 'Venus' },
      { key: 'B', text: 'Mars' },
      { key: 'C', text: 'Jupiter' },
      { key: 'D', text: 'Saturn' },
    ],
    correctAnswer: 'B',
  },
  {
    id: '3',
    text: 'What is the largest mammal on Earth?',
    options: [
      { key: 'A', text: 'African Elephant' },
      { key: 'B', text: 'Blue Whale' },
      { key: 'C', text: 'Giraffe' },
      { key: 'D', text: 'Polar Bear' },
    ],
    correctAnswer: 'B',
  },
  {
    id: '4',
    text: 'In what year did World War II end?',
    options: [
      { key: 'A', text: '1943' },
      { key: 'B', text: '1944' },
      { key: 'C', text: '1945' },
      { key: 'D', text: '1946' },
    ],
    correctAnswer: 'C',
  },
  {
    id: '5',
    text: 'Who painted the Mona Lisa?',
    options: [
      { key: 'A', text: 'Michelangelo' },
      { key: 'B', text: 'Raphael' },
      { key: 'C', text: 'Vincent van Gogh' },
      { key: 'D', text: 'Leonardo da Vinci' },
    ],
    correctAnswer: 'D',
  },
  {
    id: '6',
    text: 'What is the chemical symbol for gold?',
    options: [
      { key: 'A', text: 'Go' },
      { key: 'B', text: 'Gd' },
      { key: 'C', text: 'Au' },
      { key: 'D', text: 'Ag' },
    ],
    correctAnswer: 'C',
  },
  {
    id: '7',
    text: 'Which country has the most people?',
    options: [
      { key: 'A', text: 'India' },
      { key: 'B', text: 'United States' },
      { key: 'C', text: 'Indonesia' },
      { key: 'D', text: 'Brazil' },
    ],
    correctAnswer: 'A',
  },
  {
    id: '8',
    text: 'What is the fastest land animal?',
    options: [
      { key: 'A', text: 'Lion' },
      { key: 'B', text: 'Cheetah' },
      { key: 'C', text: 'Horse' },
      { key: 'D', text: 'Gazelle' },
    ],
    correctAnswer: 'B',
  },
  {
    id: '9',
    text: 'How many continents are there on Earth?',
    options: [
      { key: 'A', text: '5' },
      { key: 'B', text: '6' },
      { key: 'C', text: '7' },
      { key: 'D', text: '8' },
    ],
    correctAnswer: 'C',
  },
  {
    id: '10',
    text: 'What is the square root of 144?',
    options: [
      { key: 'A', text: '10' },
      { key: 'B', text: '11' },
      { key: 'C', text: '12' },
      { key: 'D', text: '14' },
    ],
    correctAnswer: 'C',
  },
  {
    id: '11',
    text: 'Which element has the atomic number 1?',
    options: [
      { key: 'A', text: 'Helium' },
      { key: 'B', text: 'Hydrogen' },
      { key: 'C', text: 'Lithium' },
      { key: 'D', text: 'Carbon' },
    ],
    correctAnswer: 'B',
  },
  {
    id: '12',
    text: 'In which city is the Colosseum located?',
    options: [
      { key: 'A', text: 'Athens' },
      { key: 'B', text: 'Rome' },
      { key: 'C', text: 'Paris' },
      { key: 'D', text: 'Madrid' },
    ],
    correctAnswer: 'B',
  },
];

/**
 * Shuffle an array using Fisher-Yates algorithm
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Get a random selection of questions for a game
 */
export function getRandomQuestions(count: number): QuestionWithAnswer[] {
  const shuffled = shuffleArray(sampleQuestions);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}
