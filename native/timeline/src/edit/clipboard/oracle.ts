import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { expect } from 'vitest';
import { checkIds, inputIds, normalize } from '../../../scripts/conformance/normalize.ts';

export function native(fn: string, args: unknown[]): any {
  if (process.env.NT_OPS_COUNT_FILE) appendFileSync(process.env.NT_OPS_COUNT_FILE, '1\n');
  const response = JSON.parse(execFileSync(process.env.NT_STRUCTURE_OPS!, [], {
    input: JSON.stringify({ fn, args }), encoding: 'utf8', timeout: 10000
  }));
  if (response.error) throw new Error(response.error);
  return response.result;
}
export function equalClips(actual: any[], expected: any[], input: unknown): void {
  const known = inputIds(input);
  expect(checkIds(actual, Array.isArray(input) ? input : [])).toEqual([]);
  expect(normalize(actual, known)).toEqual(normalize(expected, known));
}
export const edit = (doc: unknown, action: string, payload: unknown) => native('edit', [doc, action, payload]);
