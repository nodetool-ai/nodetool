/**
 * `crypto.randomUUID` for Hermes.
 *
 * `react-native-get-random-values` supplies `crypto.getRandomValues` only, and
 * Hermes ships no `randomUUID` at all. `@nodetool-ai/timeline` mints every clip,
 * track, marker, and animation id through `globalThis.crypto.randomUUID()`, so
 * an unpolyfilled runtime throws on the first edit rather than degrading.
 *
 * `crypto` itself may be missing (bare Hermes, or a test environment that
 * stubbed globals), so the object is created when absent.
 */

import { v4 as uuidv4 } from 'uuid';

/** Idempotent: an existing `randomUUID` (JSC, a newer Hermes) is left alone. */
export function installRandomUuid(): void {
  const target = globalThis as {
    crypto?: { randomUUID?: () => string };
  };
  if (target.crypto === undefined) {
    target.crypto = {};
  }
  target.crypto.randomUUID ??= () => uuidv4();
}
