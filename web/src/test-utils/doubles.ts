/**
 * Helpers for building test doubles without throwing away the type of the
 * thing they stand in for.
 *
 * They replace the `as unknown as T` chain that used to sit at every call
 * site: `stub` keeps compile-time checking of the members a double supplies,
 * and `asMock`/`asMockStore` name the one invariant a mocked module export
 * relies on.
 */

/**
 * The members of `T` a double may supply, at any depth: every name and value
 * type is still checked, only the obligation to supply all of them is lifted.
 * Functions keep their call type; array elements are relaxed the same way the
 * members of an object are.
 */
export type PartialMembers<T> = T extends Function
  ? T
  : T extends readonly (infer E)[]
    ? T | PartialMembers<E>[]
    : T extends object
      ? T | { [K in keyof T]?: PartialMembers<T[K]> }
      : T;

/**
 * Builds a double for `T` out of the members the unit under test reads.
 *
 * Every member passed is checked against `T`, so renaming or re-typing a field
 * breaks the test at compile time instead of at run time.
 */
export function stub<T>(members: PartialMembers<T>): T {
  // SAFETY: the caller supplies the members the unit under test reads; the
  // rest of `T` is never touched on the path under test, and a test that does
  // touch one fails loudly on `undefined`.
  return members as T;
}

/**
 * Reads a module export that `jest.mock` replaced as the mock it is at run
 * time.
 */
export function asMock<T>(moduleExport: T): jest.Mock {
  // SAFETY: callers pass an export of a module replaced by `jest.mock(...)`,
  // so the value is a jest mock at run time; only its static type still
  // describes the real implementation.
  return moduleExport as jest.Mock;
}

/** A mocked zustand-style hook: callable, and carrying `getState`. */
export type MockedStoreHook = jest.Mock & { getState: jest.Mock };

/**
 * Reads a mocked zustand store hook, whose `getState` the test configures
 * alongside the hook call itself.
 */
export function asMockStore<T>(moduleExport: T): MockedStoreHook {
  // SAFETY: callers pass a store hook from a module replaced by
  // `jest.mock(...)` with a `jest.fn()` carrying a `getState` mock, so both
  // the call and `getState` are jest mocks at run time.
  return moduleExport as MockedStoreHook;
}

/**
 * Builds the implementation of a mocked zustand-style hook, which is called
 * with a selector and answers with what that selector reads.
 *
 * The state's type is inferred from the members the test supplies, so the
 * selector body is checked against them: reading a field the double does not
 * provide is a compile error rather than `undefined` at run time. This is what
 * a mocked hook needs instead of `(selector: any) => selector(state)`, which
 * turns off checking on both sides of the call.
 */
export function selectorOver<S>(state: S): <R>(select: (state: S) => R) => R {
  return (select) => select(state);
}

/**
 * Reads the item a test expects to be there, failing with what it looked for
 * instead of `Cannot read properties of undefined` three lines later.
 *
 * `Array.prototype.find` widens to `T | undefined`, which is why assertions on
 * its result used to sit behind an `any`-typed callback: the `any` hid the
 * undefined rather than handling it.
 */
export function mustFind<T>(items: readonly T[], match: (item: T) => boolean, what = "item"): T {
  const found = items.find(match);
  if (found === undefined) {
    throw new Error(`expected to find a matching ${what}, got none of ${items.length}`);
  }
  return found;
}

/**
 * Installs a stand-in for a global — a DOM class jsdom does not ship, or one a
 * test must control. `Object.defineProperty` is how jsdom installs its own
 * globals, so a fake goes in the same way, with nothing asserted away.
 *
 * In jsdom `window` and `globalThis` are the same object, so this also
 * installs `window.*` members such as the Electron `api` bridge.
 */
export function installGlobal<T>(name: string, value: T): void {
  Object.defineProperty(globalThis, name, {
    value,
    configurable: true,
    writable: true
  });
}

/** Removes a global a test installed. */
export function removeGlobal(name: string): void {
  Reflect.deleteProperty(globalThis, name);
}
