/**
 * Answer a Zustand selector hook from a partial state. `Partial<S>` still
 * checks every key the test declares, so a mock cannot drift past a store
 * rename the way an `as any` one does. A bound store may be called with no
 * selector, and then returns the whole state — the two overloads below say so,
 * instead of a call with no selector claiming to return whatever the caller
 * asks for.
 */
export const selectFrom = <S,>(state: Partial<S>) => {
  // SAFETY: the single unchecked step, kept here instead of at each call site:
  // a test declares the keys the unit under test reads, and a read of any
  // other one gets `undefined` and fails loudly.
  const full = state as S;
  function select(): S;
  function select<T>(selector: (state: S) => T): T;
  function select<T>(selector?: (state: S) => T): S | T {
    return selector ? selector(full) : full;
  }
  return select;
};

export const mockAsset = {
  id: 'asset123',
  name: 'test-asset.jpg',
  content_type: 'image/jpeg',
  created_at: '2024-01-01T00:00:00Z',
  get_url: 'https://example.com/asset123.jpg'
};
