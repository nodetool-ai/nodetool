import { renderHook, act, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { useReducedMotion } from './useReducedMotion';

describe('useReducedMotion', () => {
  let changeListener: ((enabled: boolean) => void) | null = null;
  const removeSubscription = jest.fn();

  beforeEach(() => {
    jest.restoreAllMocks();
    changeListener = null;
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((
      event: string,
      handler: (v: boolean) => void
    ) => {
      if (event === 'reduceMotionChanged') {
        changeListener = handler;
      }
      return { remove: removeSubscription };
    }) as unknown as typeof AccessibilityInfo.addEventListener);
  });

  it('reflects the initial reduce-motion setting', async () => {
    (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValue(true);
    const { result } = renderHook(() => useReducedMotion());
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('updates when the setting changes', async () => {
    const { result } = renderHook(() => useReducedMotion());
    await waitFor(() => expect(result.current).toBe(false));

    act(() => {
      changeListener?.(true);
    });
    expect(result.current).toBe(true);
  });

  it('removes its listener on unmount', () => {
    const { unmount } = renderHook(() => useReducedMotion());
    unmount();
    expect(removeSubscription).toHaveBeenCalled();
  });
});
