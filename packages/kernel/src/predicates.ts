/**
 * The workspace's named type predicates, re-exported for the runner's call
 * sites. The definitions live in `@nodetool-ai/protocol`.
 */

export {
  isBoolean,
  isCallable,
  isNonEmptyString,
  isNumber,
  isString,
  /** An object value. Arrays pass — the sites that care test `Array.isArray`. */
  isObjectLike as isObjectValue
} from "@nodetool-ai/protocol";
