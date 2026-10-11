import type { AppStateStatus } from 'react-native';

import { bindAuthRefreshToAppState } from './supabase';

jest.mock('./secureStorage', () => ({ secureStorageAdapter: {} }));
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ auth: {} })),
}));

function fakeAppState(initial: AppStateStatus) {
  let listener: ((state: AppStateStatus) => void) | null = null;
  const remove = jest.fn();
  return {
    remove,
    emit: (state: AppStateStatus) => listener?.(state),
    source: {
      currentState: initial,
      addEventListener: (_type: 'change', next: (state: AppStateStatus) => void) => {
        listener = next;
        return { remove };
      },
    },
  };
}

function fakeAuth() {
  return {
    startAutoRefresh: jest.fn().mockResolvedValue(undefined),
    stopAutoRefresh: jest.fn().mockResolvedValue(undefined),
  };
}

describe('bindAuthRefreshToAppState', () => {
  it('starts auto-refresh immediately when the app is active', () => {
    const appState = fakeAppState('active');
    const auth = fakeAuth();

    bindAuthRefreshToAppState(appState.source, auth);

    expect(auth.startAutoRefresh).toHaveBeenCalledTimes(1);
    expect(auth.stopAutoRefresh).not.toHaveBeenCalled();
  });

  it('stops in the background and restarts on returning to the foreground', () => {
    const appState = fakeAppState('active');
    const auth = fakeAuth();
    bindAuthRefreshToAppState(appState.source, auth);

    appState.emit('background');
    expect(auth.stopAutoRefresh).toHaveBeenCalledTimes(1);

    appState.emit('active');
    expect(auth.startAutoRefresh).toHaveBeenCalledTimes(2);
  });

  it('removes the listener and stops the timer on cleanup', () => {
    const appState = fakeAppState('background');
    const auth = fakeAuth();

    const unbind = bindAuthRefreshToAppState(appState.source, auth);
    expect(auth.startAutoRefresh).not.toHaveBeenCalled();

    unbind();
    expect(appState.remove).toHaveBeenCalled();
    expect(auth.stopAutoRefresh).toHaveBeenCalledTimes(2);
  });
});
