/**
 * Named type predicates for the representation checks the mobile app makes on
 * values that arrive from a workflow run or a node property.
 */

export const isString = (value: unknown): value is string =>
  typeof value === "string";

export const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value !== "";

export const isNumber = (value: unknown): value is number =>
  typeof value === "number";

/** A number that is neither NaN nor infinite. */
export const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export const isBoolean = (value: unknown): value is boolean =>
  typeof value === "boolean";

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/**
 * A URI that resolves to stored bytes. `memory://` refs are in-memory only and
 * can never be fetched, so they do not count.
 */
export const isStoredUri = (value: unknown): value is string =>
  typeof value === "string" && value !== "" && !value.startsWith("memory://");
