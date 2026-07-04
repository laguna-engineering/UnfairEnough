import {
  type DbAdapter,
  parseQuestionSetYaml,
  type QuestionSetWithMeta,
  type QuestionWithMeta,
  questionsRepo,
} from '@unfairenough/db';

export type ImportSetResult =
  | { ok: true; set: QuestionSetWithMeta; questions: QuestionWithMeta[] }
  | { ok: false; errors: string[] };

/**
 * Parse one question-set YAML, persist it in a transaction, and read it back.
 * Shared by the single-YAML and bundle upload endpoints so import semantics
 * (setId generation, the transaction wrapper, the read-back) live in one place.
 *
 * Returns `{ ok: false }` for validation errors; DB failures throw (callers
 * decide whether to abort the request or record a per-set error).
 */
export async function importAndPersistSet(
  db: DbAdapter,
  yamlText: string,
  hostId: string | null,
): Promise<ImportSetResult> {
  const result = parseQuestionSetYaml(yamlText);
  if (!result.success) {
    return { ok: false, errors: result.errors };
  }

  const setId = crypto.randomUUID();
  await db.transaction(async () => {
    await questionsRepo.importQuestionSet(
      db,
      setId,
      result.data,
      () => crypto.randomUUID(),
      hostId,
    );
  });

  const set = await questionsRepo.getQuestionSet(db, setId);
  const questions = await questionsRepo.getQuestionsBySet(db, setId);
  // The set was just inserted in the committed transaction above, so it exists.
  return { ok: true, set: set as QuestionSetWithMeta, questions };
}
