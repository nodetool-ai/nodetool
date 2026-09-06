/**
 * The workspace's named type predicates, re-exported for the debug harnesses'
 * call sites. The definitions live in `@nodetool-ai/protocol`.
 */

export {
  isBoolean,
  isFiniteNumber,
  isNonBlankString,
  isNonEmptyString,
  isNumber,
  isObjectLike,
  isPositiveFiniteNumber,
  isRecord,
  isString,
  isCallable as isFunctionValue
} from "@nodetool-ai/protocol";
