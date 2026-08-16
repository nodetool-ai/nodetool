import { renderHook, act, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, type EmitterSubscription } from 'react-native';
import { useReducedMotion } from './useReducedMotion';

describe('useReducedMotion', () => {
  /**
   * `AccessibilityInfo.addEventListener` is overloaded, and `jest.spyOn`
   * resolves the announcement overload, so the captured handler carries that
   * event's parameter type even though the hook registers the reduce-motion
   * one. Held under a parameter type every handler accepts.
   */
  let changeListener: ((enabled: never) => void) | null = null;
  const removeSubscription = jest.fn();
  const subscription: Pick<EmitterSubscription, 'remove'> = {
    remove: removeSubscription,
  };

  beforeEach(() => {
    jest.restoreAllMocks();
    changeListener = null;
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(false);
    jest
      .spyOn(AccessibilityInfo, 'addEventListener')
      .mockImplementation((event, handler) => {
        if (String(event) === 'reduceMotionChanged') {
          changeListener = handler;
        }
        // SAFETY: the hook only ever calls `.remove()` on the subscription.
        return subscription as EmitterSubscription;
      });
  });

  it('reflects the initial reduce-motion setting', async () => {
    jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(true);
    const { result } = renderHook(() => useReducedMotion());
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('updates when the setting changes', async () => {
    const { result } = renderHook(() => useReducedMotion());
    await waitFor(() => expect(result.current).toBe(false));

    act(() => {
      // SAFETY: RN calls a 'reduceMotionChanged' handler with a boolean; only
      // the announcement overload jest.spyOn resolved says otherwise.
      changeListener?.(true as never);
    });
    expect(result.current).toBe(true);
  });

  it('removes its listener on unmount', () => {
    const { unmount } = renderHook(() => useReducedMotion());
    unmount();
    expect(removeSubscription).toHaveBeenCalled();
  });
});
