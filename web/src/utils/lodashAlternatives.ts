/**
 * Lightweight alternatives to lodash utility functions.
 *
 * These replace lodash/debounce, lodash/throttle and lodash/omit so that the
 * lodash dependency can be removed from the web package.
 */

// ---- debounce ----

export interface DebouncedFunction<T extends (...args: any[]) => void> {
  (...args: Parameters<T>): void;
  cancel(): void;
}

/**
 * Creates a debounced version of `fn` that delays invocation until after `ms`
 * milliseconds have elapsed since the last call.  Calling `.cancel()` on the
 * returned function clears any pending timeout.
 */
export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  ms: number
): DebouncedFunction<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const debounced = (...args: Parameters<T>) => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = undefined;
      fn(...args);
    }, ms);
  };
  debounced.cancel = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };
  return debounced as DebouncedFunction<T>;
}

// ---- throttle ----

export interface ThrottledFunction<T extends (...args: any[]) => void> {
  (...args: Parameters<T>): void;
  cancel(): void;
}

/**
 * Creates a throttled version of `fn` that invokes at most once per `ms`
 * milliseconds.  The first call fires immediately; subsequent calls within the
 * window are deferred to the end of the window.  `.cancel()` clears any
 * pending trailing invocation.
 */
export function throttle<T extends (...args: any[]) => void>(
  fn: T,
  ms: number
): ThrottledFunction<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastArgs: Parameters<T> | undefined;

  const throttled = (...args: Parameters<T>) => {
    if (timer !== undefined) {
      // Inside a throttle window — remember the latest args for trailing call.
      lastArgs = args;
      return;
    }
    // Fire immediately.
    fn(...args);
    timer = setTimeout(() => {
      timer = undefined;
      if (lastArgs !== undefined) {
        fn(...lastArgs);
        lastArgs = undefined;
        // Start a new throttle window for the trailing call.
        timer = setTimeout(() => {
          timer = undefined;
        }, ms);
      }
    }, ms);
  };

  throttled.cancel = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    lastArgs = undefined;
  };

  return throttled as ThrottledFunction<T>;
}

// ---- omit ----

/**
 * Returns a shallow copy of `obj` without the specified `keys`.
 * Accepts a single key or an array of keys, matching lodash's API.
 */
export function omit<T extends object, K extends keyof T>(
  obj: T,
  keys: K | K[]
): Omit<T, K> {
  const result = { ...obj };
  const keyArray = Array.isArray(keys) ? keys : [keys];
  for (const key of keyArray) {
    delete result[key];
  }
  return result;
}
