import { focusManager, onlineManager } from '@tanstack/react-query';
import {
  isPersistableQueryKey,
  onAppStateChange,
  PERSIST_MAX_AGE,
  queryClient,
} from './queryClient';

describe('isPersistableQueryKey', () => {
  it('excludes the tRPC secrets queries', () => {
    expect(
      isPersistableQueryKey([['settings', 'secrets', 'list'], { type: 'query' }])
    ).toBe(false);
    expect(isPersistableQueryKey(['secrets'])).toBe(false);
  });

  it('allows ordinary list queries', () => {
    expect(
      isPersistableQueryKey([['workflows', 'list'], { type: 'query' }])
    ).toBe(true);
    expect(isPersistableQueryKey(['assets', { cursor: null }])).toBe(true);
  });
});

describe('queryClient', () => {
  it('keeps queries in memory as long as the persisted snapshot lives', () => {
    expect(queryClient.getDefaultOptions().queries?.gcTime).toBe(PERSIST_MAX_AGE);
  });

  it('wires connectivity into the online manager', () => {
    expect(onlineManager.isOnline()).toEqual(expect.any(Boolean));
  });

  it('treats only an active app as focused, so foregrounding refetches stale queries', () => {
    onAppStateChange('background');
    expect(focusManager.isFocused()).toBe(false);

    onAppStateChange('active');
    expect(focusManager.isFocused()).toBe(true);
  });
});
