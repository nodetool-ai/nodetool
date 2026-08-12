/**
 * Answer a Zustand selector hook from a partial state. `Partial<S>` still
 * checks every key the test declares, so a mock cannot drift past a store
 * rename the way an `as any` one does. Widening back to `S` is the single
 * unchecked step, kept here instead of at each call site. A bound store may be
 * called with no selector, and then returns the whole state.
 */
export const selectFrom =
  <S,>(state: Partial<S>) =>
  <T,>(selector?: (state: S) => T): T =>
    selector ? selector(state as S) : (state as unknown as T);

export const mockAsset = {
  id: 'asset123',
  name: 'test-asset.jpg',
  content_type: 'image/jpeg',
  created_at: '2024-01-01T00:00:00Z',
  get_url: 'https://example.com/asset123.jpg'
};
