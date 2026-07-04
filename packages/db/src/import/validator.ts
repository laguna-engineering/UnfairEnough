export interface QuestionOptionInput {
  key: string;
  text: string;
}

export interface MediaInput {
  type: 'image' | 'audio' | 'video';
  url: string;
  previewDuration?: number;
}

export interface AudioInput {
  url: string;
  play: 'preview' | 'question';
  role: 'subject' | 'background';
  duration?: number;
}

export interface QuestionInput {
  id?: string;
  text: string;
  type?: 'multiple_choice' | 'true_false';
  category?: string;
  tags?: string[];
  hideTags?: boolean;
  language?: string;
  timeLimit?: number;
  media?: MediaInput;
  audio?: AudioInput;
  options: QuestionOptionInput[];
  correctAnswer: string;
  playerDifficulty?: Record<string, number>;
  difficulty?: number;
  explanation?: string;
}

export interface QuestionSetInput {
  name: string;
  author?: string;
  description?: string;
  defaultTimeLimit?: number;
  tags?: string[];
  language?: string;
  availableInCasual?: boolean;
  questions: QuestionInput[];
}

const VALID_ANSWER_KEYS = ['A', 'B', 'C', 'D'];
const VALID_TF_ANSWERS = ['true', 'false'];
const VALID_MEDIA_TYPES = ['image', 'audio', 'video'];
const VALID_QUESTION_TYPES = ['multiple_choice', 'true_false'];
const VALID_AUDIO_PLAY = ['preview', 'question'];
const VALID_AUDIO_ROLE = ['subject', 'background'];

export function validateQuestionSet(raw: unknown): { data: QuestionSetInput; errors: string[] } {
  const errors: string[] = [];

  if (!raw || typeof raw !== 'object') {
    return { data: null as any, errors: ['Input must be an object'] };
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj.name !== 'string' || obj.name.trim().length === 0) {
    errors.push('name: required non-empty string');
  }

  if (!Array.isArray(obj.questions) || obj.questions.length === 0) {
    errors.push('questions: required non-empty array');
    return { data: null as any, errors };
  }

  const defaultTimeLimit = typeof obj.defaultTimeLimit === 'number' ? obj.defaultTimeLimit : 10;

  const seenIds = new Set<string>();
  const questions: QuestionInput[] = [];

  for (let i = 0; i < obj.questions.length; i++) {
    const q = obj.questions[i];
    const prefix = `questions[${i}]`;

    if (!q || typeof q !== 'object') {
      errors.push(`${prefix}: must be an object`);
      continue;
    }

    const qObj = q as Record<string, unknown>;
    const type =
      typeof qObj.type === 'string' && VALID_QUESTION_TYPES.includes(qObj.type)
        ? (qObj.type as 'multiple_choice' | 'true_false')
        : 'multiple_choice';

    if (typeof qObj.text !== 'string' || qObj.text.trim().length === 0) {
      errors.push(`${prefix}.text: required non-empty string`);
    }

    // Validate options
    if (!Array.isArray(qObj.options) || qObj.options.length < 2) {
      errors.push(`${prefix}.options: required array with at least 2 entries`);
    } else {
      if (type === 'multiple_choice' && qObj.options.length > 4) {
        errors.push(`${prefix}.options: multiple_choice allows max 4 options`);
      }
      if (type === 'true_false' && qObj.options.length !== 2) {
        errors.push(`${prefix}.options: true_false requires exactly 2 options`);
      }
      for (let j = 0; j < qObj.options.length; j++) {
        const opt = qObj.options[j] as Record<string, unknown> | undefined;
        if (!opt || typeof opt.key !== 'string' || typeof opt.text !== 'string') {
          errors.push(`${prefix}.options[${j}]: must have key and text strings`);
        }
      }
    }

    // Validate correctAnswer
    if (typeof qObj.correctAnswer !== 'string') {
      errors.push(`${prefix}.correctAnswer: required string`);
    } else if (type === 'multiple_choice') {
      if (!VALID_ANSWER_KEYS.includes(qObj.correctAnswer)) {
        errors.push(`${prefix}.correctAnswer: must be one of A, B, C, D`);
      }
      if (Array.isArray(qObj.options)) {
        const optionKeys = qObj.options.map((o: any) => o?.key);
        if (!optionKeys.includes(qObj.correctAnswer)) {
          errors.push(
            `${prefix}.correctAnswer: "${qObj.correctAnswer}" not found in options [${optionKeys.join(', ')}]`,
          );
        }
      }
    } else if (type === 'true_false') {
      if (!VALID_TF_ANSWERS.includes(qObj.correctAnswer)) {
        errors.push(`${prefix}.correctAnswer: must be "true" or "false"`);
      }
    }

    // Validate unique IDs
    if (typeof qObj.id === 'string') {
      if (seenIds.has(qObj.id)) {
        errors.push(`${prefix}: duplicate id "${qObj.id}"`);
      }
      seenIds.add(qObj.id);
    }

    // Validate media
    let media: MediaInput | undefined;
    if (qObj.media && typeof qObj.media === 'object') {
      const m = qObj.media as Record<string, unknown>;
      if (typeof m.type !== 'string' || !VALID_MEDIA_TYPES.includes(m.type)) {
        errors.push(`${prefix}.media.type: must be image, audio, or video`);
      }
      if (typeof m.url !== 'string' || m.url.trim().length === 0) {
        errors.push(`${prefix}.media.url: required non-empty string`);
      }
      media = {
        type: m.type as MediaInput['type'],
        url: m.url as string,
        previewDuration: typeof m.previewDuration === 'number' ? m.previewDuration : 5,
      };
    }

    // Validate audio (KTD1): separate block from `media`. Defaults:
    // play='question', role='background'. `preview` requires `subject`.
    let audio: AudioInput | undefined;
    if (qObj.audio && typeof qObj.audio === 'object') {
      const a = qObj.audio as Record<string, unknown>;

      if (typeof a.url !== 'string' || a.url.trim().length === 0) {
        errors.push(`${prefix}.audio.url: required non-empty string`);
      }
      if (a.play !== undefined && !VALID_AUDIO_PLAY.includes(a.play as string)) {
        errors.push(`${prefix}.audio.play: must be preview or question`);
      }
      if (a.role !== undefined && !VALID_AUDIO_ROLE.includes(a.role as string)) {
        errors.push(`${prefix}.audio.role: must be subject or background`);
      }
      if (a.duration !== undefined && (typeof a.duration !== 'number' || a.duration <= 0)) {
        errors.push(`${prefix}.audio.duration: must be a positive number`);
      }

      const play = VALID_AUDIO_PLAY.includes(a.play as string)
        ? (a.play as AudioInput['play'])
        : 'question';
      const role = VALID_AUDIO_ROLE.includes(a.role as string)
        ? (a.role as AudioInput['role'])
        : 'background';

      // A preview clip is always the subject of the question.
      if (play === 'preview' && role === 'background') {
        errors.push(`${prefix}.audio: play "preview" requires role "subject"`);
      }

      audio = {
        url: typeof a.url === 'string' ? a.url : '',
        play,
        role,
        duration: typeof a.duration === 'number' && a.duration > 0 ? a.duration : undefined,
      };
    }

    // Validate timeLimit
    if (
      qObj.timeLimit !== undefined &&
      (typeof qObj.timeLimit !== 'number' || qObj.timeLimit < 1 || qObj.timeLimit > 120)
    ) {
      errors.push(`${prefix}.timeLimit: must be a number between 1 and 120`);
    }

    // Validate difficulty
    if (
      qObj.difficulty !== undefined &&
      (typeof qObj.difficulty !== 'number' ||
        !Number.isInteger(qObj.difficulty) ||
        qObj.difficulty < 1 ||
        qObj.difficulty > 5)
    ) {
      errors.push(`${prefix}.difficulty: must be an integer between 1 and 5`);
    }

    questions.push({
      id: typeof qObj.id === 'string' ? qObj.id : undefined,
      text: String(qObj.text ?? ''),
      type,
      category: typeof qObj.category === 'string' ? qObj.category : undefined,
      tags: Array.isArray(qObj.tags)
        ? (() => {
            const raw = qObj.tags
              .filter((t): t is string => typeof t === 'string')
              .map((t) => t.toLowerCase().trim())
              .filter((t) => t.length > 0);
            const deduped = [...new Set(raw)];
            if (deduped.length > 10) {
              errors.push(`${prefix}.tags: has ${deduped.length} tags (recommended max 10)`);
            }
            return deduped;
          })()
        : undefined,
      timeLimit: typeof qObj.timeLimit === 'number' ? qObj.timeLimit : undefined,
      media,
      audio,
      options: Array.isArray(qObj.options)
        ? qObj.options.map((o: any) => ({ key: String(o?.key ?? ''), text: String(o?.text ?? '') }))
        : [],
      correctAnswer: String(qObj.correctAnswer ?? ''),
      playerDifficulty:
        qObj.playerDifficulty && typeof qObj.playerDifficulty === 'object'
          ? (qObj.playerDifficulty as Record<string, number>)
          : undefined,
      difficulty:
        typeof qObj.difficulty === 'number' && Number.isInteger(qObj.difficulty)
          ? qObj.difficulty
          : undefined,
      explanation: typeof qObj.explanation === 'string' ? qObj.explanation : undefined,
      hideTags: qObj.hideTags === true ? true : undefined,
      language:
        typeof qObj.language === 'string' && qObj.language.trim().length > 0
          ? qObj.language.trim()
          : undefined,
    });
  }

  const data: QuestionSetInput = {
    name: String(obj.name ?? ''),
    author: typeof obj.author === 'string' ? obj.author : undefined,
    description: typeof obj.description === 'string' ? obj.description : undefined,
    defaultTimeLimit,
    language:
      typeof obj.language === 'string' && obj.language.trim().length > 0
        ? obj.language.trim()
        : undefined,
    availableInCasual:
      typeof obj.availableInCasual === 'boolean' ? obj.availableInCasual : undefined,
    tags: Array.isArray(obj.tags)
      ? [
          ...new Set(
            obj.tags
              .filter((t): t is string => typeof t === 'string')
              .map((t) => t.toLowerCase().trim())
              .filter((t) => t.length > 0),
          ),
        ]
      : undefined,
    questions,
  };

  return { data, errors };
}
