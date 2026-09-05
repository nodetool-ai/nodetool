/**
 * Re-export of the workspace's one predicate module.
 *
 * Kept as a file so the ~55 modules in this package that import
 * `./type-predicates.js` keep resolving; the definitions live in
 * `@nodetool-ai/protocol`.
 */

import { isObjectLike as isObjectLikeRecord } from "@nodetool-ai/protocol";

export {
  isBoolean,
  isCallable,
  isFiniteNumber,
  isInteger,
  isNonBlankString,
  isNonEmptyString,
  isNumber,
  isPositiveFiniteNumber,
  isRecord,
  isString
} from "@nodetool-ai/protocol";

/**
 * Same check as the protocol predicate, narrowed to `object` rather than
 * `Record<string, unknown>`. `providers/replicate-provider.ts:93` casts the
 * narrowed value to `ReadableStream`, which TypeScript refuses from a
 * `Record`; once that cast goes through `unknown` this can re-export directly.
 */
export function isObjectLike(value: unknown): value is object {
  return isObjectLikeRecord(value);
}
