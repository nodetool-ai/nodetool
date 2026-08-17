import { useEffect, useState } from 'react';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

/**
 * Decide whether a NetInfo snapshot counts as "online".
 *
 * `isInternetReachable` is `null` while NetInfo is still probing — that is an
 * unknown, not a negative, so only an explicit `false` marks us offline. A
 * device attached to a captive-portal Wi-Fi reports `isConnected: true` with
 * `isInternetReachable: false`, which this correctly treats as offline.
 *
 * Exported so non-React callers (the React Query `onlineManager` wiring in
 * `queryClient.ts`) apply exactly the same rule as the hook.
 */
export function isOnlineState(state: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>): boolean {
  return state.isConnected === true && state.isInternetReachable !== false;
}

interface NetworkStatus {
  /** The device has a connection that is not known to be unreachable. */
  isOnline: boolean;
  /** Convenience inverse of `isOnline`. */
  isOffline: boolean;
}

/**
 * Track device connectivity via NetInfo.
 *
 * Starts optimistic (`isOnline: true`) so the UI doesn't flash an offline
 * banner during the first probe; NetInfo pushes the real state immediately
 * after subscribing.
 */
export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(isOnlineState(state));
    });
    return unsubscribe;
  }, []);

  return { isOnline, isOffline: !isOnline };
}
