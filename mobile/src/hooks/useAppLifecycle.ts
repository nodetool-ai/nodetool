/**
 * App foreground/background lifecycle.
 *
 * iOS suspends WebSockets within seconds of the app going to the background, so
 * anything holding a long-lived socket needs to know when the app comes back.
 * This module wraps React Native's `AppState` in a single shared subscription
 * and turns raw status changes into two coarse events:
 *
 * - `'background'` — `active` → `background` | `inactive`
 * - `'foreground'` — `background` | `inactive` → `active`
 *
 * Only real transitions are emitted; repeated `AppState` events for the same
 * phase (e.g. `inactive` → `background`) are collapsed.
 *
 * Two entry points, same underlying subscription:
 *
 * ```ts
 * // Non-React (services, stores):
 * import { subscribeAppLifecycle, isAppForeground } from '../hooks/useAppLifecycle';
 * const unsubscribe = subscribeAppLifecycle((event) => { ... });
 *
 * // React (call once at the root, e.g. in App.tsx):
 * import { useAppLifecycle } from './src/hooks/useAppLifecycle';
 * const appState = useAppLifecycle();                       // 'active' | 'background' | ...
 * const appState = useAppLifecycle({ onForeground, onBackground });
 * ```
 *
 * `useAppLifecycle()` at the root is not required for services to work — the
 * `AppState` listener is attached lazily by the first subscriber of either kind
 * — but it keeps the app's foreground status available to the UI tree and makes
 * the lifecycle wiring explicit.
 */

import { useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

export type AppLifecycleEvent = 'foreground' | 'background';

export type AppLifecycleListener = (event: AppLifecycleEvent) => void;

interface AppLifecycleHandlers {
  onForeground?: () => void;
  onBackground?: () => void;
}

const listeners = new Set<AppLifecycleListener>();

let nativeSubscription: { remove: () => void } | null = null;
let currentState: AppStateStatus = AppState.currentState ?? 'active';

function emit(event: AppLifecycleEvent): void {
  listeners.forEach((listener) => {
    try {
      listener(event);
    } catch (error) {
      console.error('appLifecycle: listener error:', error);
    }
  });
}

function handleAppStateChange(nextState: AppStateStatus): void {
  const previousState = currentState;
  currentState = nextState;

  if (previousState === nextState) {
    return;
  }
  if (nextState === 'active') {
    emit('foreground');
  } else if (previousState === 'active') {
    emit('background');
  }
}

function ensureNativeSubscription(): void {
  if (nativeSubscription) {
    return;
  }
  currentState = AppState.currentState ?? currentState;
  nativeSubscription = AppState.addEventListener('change', handleAppStateChange);
}

function releaseNativeSubscription(): void {
  if (listeners.size > 0 || !nativeSubscription) {
    return;
  }
  nativeSubscription.remove();
  nativeSubscription = null;
}

/** The last `AppState` status seen by this module. */
export function getAppState(): AppStateStatus {
  return currentState;
}

/** True while the app is in the foreground (`AppState` is `active`). */
export function isAppForeground(): boolean {
  return currentState === 'active';
}

/**
 * Subscribe to foreground/background transitions from non-React code.
 * Returns an unsubscribe function.
 */
export function subscribeAppLifecycle(listener: AppLifecycleListener): () => void {
  listeners.add(listener);
  ensureNativeSubscription();

  return () => {
    listeners.delete(listener);
    releaseNativeSubscription();
  };
}

/**
 * React binding for {@link subscribeAppLifecycle}. Returns the current
 * `AppState` status and invokes the optional handlers on each transition.
 */
export function useAppLifecycle(handlers?: AppLifecycleHandlers): AppStateStatus {
  const [appState, setAppState] = useState<AppStateStatus>(getAppState);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    return subscribeAppLifecycle((event) => {
      setAppState(getAppState());
      if (event === 'foreground') {
        handlersRef.current?.onForeground?.();
      } else {
        handlersRef.current?.onBackground?.();
      }
    });
  }, []);

  return appState;
}
