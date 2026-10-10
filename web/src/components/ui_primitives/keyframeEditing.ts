/**
 * Pure editing rules shared by `CurveEditor` and `GradientEditor`. Keys are
 * kept sorted by `t` in [0, 1]: a moved key is clamped between its
 * neighbours, so editing never reorders keys and a selection stays on the
 * key it started on.
 */

export interface TimedKey {
  t: number;
}

/** A piecewise-linear key: `value` at normalized time `t`. */
export interface CurveKey extends TimedKey {
  value: number;
}

/** A gradient stop: a `#rrggbb` colour at normalized time `t`. */
export interface GradientStop extends TimedKey {
  color: string;
}

/** Rounds to four decimals so repeated key steps do not accumulate float noise. */
export function roundKeyNumber(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** The time `t` clamped to [0, 1] and between the neighbours of `keys[index]`. */
export function clampKeyTime(keys: readonly TimedKey[], index: number, t: number): number {
  const lower = index > 0 ? keys[index - 1].t : 0;
  const upper = index < keys.length - 1 ? keys[index + 1].t : 1;
  return roundKeyNumber(clampNumber(t, lower, upper));
}

/** Replaces `keys[index]` with `patch` applied, clamping its time between its neighbours. */
export function updateKey<K extends TimedKey>(keys: readonly K[], index: number, patch: Partial<K>): K[] {
  return keys.map((key, position) => {
    if (position !== index) {
      return key;
    }
    const next = { ...key, ...patch };
    next.t = clampKeyTime(keys, index, next.t);
    return next;
  });
}

/** Removes `keys[index]` unless that would leave fewer than `minKeys`. */
export function removeKey<K extends TimedKey>(keys: readonly K[], index: number, minKeys = 1): K[] {
  if (keys.length <= minKeys || index < 0 || index >= keys.length) {
    return [...keys];
  }
  return keys.filter((_, position) => position !== index);
}

/**
 * Where a key added next to `keys[index]` goes: halfway to the following key
 * (or to t = 1), or halfway to the preceding key (or to t = 0) when there is
 * no room after.
 */
export function insertionTime(keys: readonly TimedKey[], index: number): number {
  const current = keys[index]?.t ?? 0;
  const after = index < keys.length - 1 ? keys[index + 1].t : 1;
  if (after > current) {
    return roundKeyNumber((current + after) / 2);
  }
  const before = index > 0 ? keys[index - 1].t : 0;
  return roundKeyNumber((before + current) / 2);
}

/** The index a new key at `t` takes so the list stays sorted. Equal times go after existing keys. */
export function insertionIndex(keys: readonly TimedKey[], t: number): number {
  const index = keys.findIndex((key) => key.t > t);
  return index === -1 ? keys.length : index;
}

/** Inserts `key` in time order and returns the new list and the key's index. */
export function insertKey<K extends TimedKey>(keys: readonly K[], key: K): { keys: K[]; index: number } {
  const index = insertionIndex(keys, key.t);
  return { keys: [...keys.slice(0, index), key, ...keys.slice(index)], index };
}

/** The span of `keys` around `t` and the mix between its ends, holding the end values outside the keyed span. */
function segmentAt<K extends TimedKey>(keys: readonly K[], t: number): { from: K; to: K; mix: number } {
  if (t <= keys[0].t) {
    return { from: keys[0], to: keys[0], mix: 0 };
  }
  for (let index = 1; index < keys.length; index += 1) {
    const to = keys[index];
    if (t <= to.t) {
      const from = keys[index - 1];
      const span = to.t - from.t;
      return { from, to, mix: span <= 0 ? 1 : (t - from.t) / span };
    }
  }
  const last = keys[keys.length - 1];
  return { from: last, to: last, mix: 0 };
}

/** Evaluates piecewise-linear curve keys at `t`, holding the end values outside the keyed span. */
export function evaluateCurveKeys(keys: readonly CurveKey[], t: number): number {
  const { from, to, mix } = segmentAt(keys, t);
  return from.value + (to.value - from.value) * mix;
}

function hexChannels(color: string): [number, number, number] {
  const value = Number.parseInt(color.slice(1, 7), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/** Evaluates gradient stops at `t` as `#rrggbb`, with the same rules as {@link evaluateCurveKeys}. */
export function evaluateGradientStops(stops: readonly GradientStop[], t: number): string {
  const { from, to, mix } = segmentAt(stops, t);
  const start = hexChannels(from.color);
  const end = hexChannels(to.color);
  return `#${start.map((channel, index) => Math.round(channel + (end[index] - channel) * mix).toString(16).padStart(2, "0")).join("")}`;
}
