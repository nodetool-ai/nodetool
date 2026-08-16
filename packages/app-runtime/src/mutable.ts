/**
 * The same shape with its `readonly` modifiers dropped, so an object can be
 * built one property at a time and the optional ones left out entirely.
 */
export type Mutable<T> = { -readonly [K in keyof T]: T[K] };
