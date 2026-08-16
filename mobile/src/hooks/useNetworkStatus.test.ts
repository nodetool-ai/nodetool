import { act, renderHook } from '@testing-library/react-native';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { isOnlineState, useNetworkStatus } from './useNetworkStatus';

type Listener = (state: NetInfoState) => void;

const addEventListener = NetInfo.addEventListener as jest.MockedFunction<
  typeof NetInfo.addEventListener
>;

function state(
  isConnected: boolean | null,
  isInternetReachable: boolean | null
): NetInfoState {
  return { isConnected, isInternetReachable } as NetInfoState;
}

describe('isOnlineState', () => {
  it('is online when connected and reachability is unknown', () => {
    expect(isOnlineState(state(true, null))).toBe(true);
  });

  it('is online when connected and reachable', () => {
    expect(isOnlineState(state(true, true))).toBe(true);
  });

  it('is offline when the connection is not internet-reachable', () => {
    expect(isOnlineState(state(true, false))).toBe(false);
  });

  it('is offline when disconnected', () => {
    expect(isOnlineState(state(false, null))).toBe(false);
    expect(isOnlineState(state(null, true))).toBe(false);
  });
});

describe('useNetworkStatus', () => {
  let listener: Listener | undefined;
  const unsubscribe = jest.fn();

  beforeEach(() => {
    listener = undefined;
    unsubscribe.mockClear();
    addEventListener.mockReset();
    addEventListener.mockImplementation((cb) => {
      listener = cb;
      return unsubscribe;
    });
  });

  it('starts optimistic and follows NetInfo updates', () => {
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current).toEqual({ isOnline: true, isOffline: false });

    act(() => listener?.(state(false, false)));
    expect(result.current).toEqual({ isOnline: false, isOffline: true });

    act(() => listener?.(state(true, null)));
    expect(result.current).toEqual({ isOnline: true, isOffline: false });
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useNetworkStatus());
    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
