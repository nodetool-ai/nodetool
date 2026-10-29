import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { timelineDocument } from '../../../../packages/protocol/src/api-schemas/timeline';

const input: unknown = JSON.parse(readFileSync(0, 'utf8'));
const result = timelineDocument.safeParse(input);
if (!result.success) {
  process.stderr.write(`${result.error.message}\n`);
  process.exitCode = 1;
} else if (!isDeepStrictEqual(result.data, input)) {
  process.stderr.write('Timeline document changes when parsed by the server schema.\n');
  process.exitCode = 1;
}
