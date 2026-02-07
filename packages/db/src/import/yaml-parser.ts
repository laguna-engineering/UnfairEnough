import YAML from 'yaml';
import { validateQuestionSet, type QuestionSetInput } from './validator';

export type ParseResult =
  | { success: true; data: QuestionSetInput }
  | { success: false; errors: string[] };

/**
 * Parse a YAML string into a validated QuestionSet.
 * Uses the `yaml` package (eemeli) with security protections:
 * - maxAliasCount: 0 — blocks YAML bombs (alias expansion DoS)
 * - merge: false — blocks merge keys (prototype pollution vector)
 */
export function parseQuestionSetYaml(input: string): ParseResult {
  let raw: unknown;
  try {
    raw = YAML.parse(input, { maxAliasCount: 0, merge: false });
  } catch (err) {
    return {
      success: false,
      errors: [`YAML parse error: ${err instanceof Error ? err.message : String(err)}`],
    };
  }

  const { data, errors } = validateQuestionSet(raw);

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return { success: true, data };
}
