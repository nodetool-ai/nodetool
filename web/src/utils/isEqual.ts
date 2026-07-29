/**
 * Deep structural equality, drop-in replacement for `fast-deep-equal/es6`.
 *
 * Handles plain objects, arrays, primitives, Date, RegExp, Map, Set, and
 * typed arrays. NaN equals NaN (SameValueZero via Object.is fallback), +0
 * equals -0 (matching fast-deep-equal). Functions and other non-plain
 * objects compare by reference. Reference equality is the fast path.
 */

const hasOwn = Object.prototype.hasOwnProperty;

function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }

  if (
    typeof a !== "object" ||
    typeof b !== "object" ||
    a === null ||
    b === null
  ) {
    // NaN !== NaN under ===; treat them as equal.
    return a !== a && b !== b;
  }

  if (a.constructor !== b.constructor) {
    return false;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      if (!isEqual(a[i], b[i])) {
        return false;
      }
    }
    return true;
  }

  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) {
      return false;
    }
    for (const [key, value] of a) {
      if (!b.has(key)) {
        return false;
      }
      if (!isEqual(value, b.get(key))) {
        return false;
      }
    }
    return true;
  }

  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) {
      return false;
    }
    for (const value of a) {
      if (!b.has(value)) {
        return false;
      }
    }
    return true;
  }

  if (ArrayBuffer.isView(a) && ArrayBuffer.isView(b)) {
    const viewA = a as unknown as ArrayLike<number>;
    const viewB = b as unknown as ArrayLike<number>;
    if (viewA.length !== viewB.length) {
      return false;
    }
    for (let i = 0; i < viewA.length; i++) {
      if (viewA[i] !== viewB[i]) {
        return false;
      }
    }
    return true;
  }

  if (a instanceof RegExp && b instanceof RegExp) {
    return a.source === b.source && a.flags === b.flags;
  }

  if (a instanceof Date && b instanceof Date) {
    return Object.is(a.getTime(), b.getTime());
  }

  if (a.valueOf !== Object.prototype.valueOf) {
    return a.valueOf() === b.valueOf();
  }
  if (a.toString !== Object.prototype.toString) {
    return a.toString() === b.toString();
  }

  const recA = a as Record<string, unknown>;
  const recB = b as Record<string, unknown>;
  const keys = Object.keys(recA);
  if (keys.length !== Object.keys(recB).length) {
    return false;
  }
  for (const key of keys) {
    if (!hasOwn.call(recB, key)) {
      return false;
    }
    if (!isEqual(recA[key], recB[key])) {
      return false;
    }
  }
  return true;
}

export default isEqual;
