import { AccessibilityInfo } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { OfflineBanner } from './OfflineBanner';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}));

type Listener = (state: NetInfoState) => void;

const addEventListener = NetInfo.addEventListener as jest.MockedFunction<
  typeof NetInfo.addEventListener
>;

function netState(
  isConnected: boolean,
  isInternetReachable: boolean | null
): NetInfoState {
  return { isConnected, isInternetReachable } as NetInfoState;
}

describe('OfflineBanner', () => {
  let listener: Listener | undefined;

  beforeEach(() => {
    listener = undefined;
    addEventListener.mockReset();
    addEventListener.mockImplementation((cb) => {
      listener = cb;
      return jest.fn();
    });
  });

  it('renders nothing while online', () => {
    render(<OfflineBanner />);
    expect(screen.queryByTestId('offline-banner')).toBeNull();
  });

  it('shows an accessible alert when the connection drops', () => {
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => undefined);

    render(<OfflineBanner />);
    act(() => listener?.(netState(true, false)));

    const banner = screen.getByTestId('offline-banner');
    expect(banner).toBeTruthy();
    expect(banner.props.accessibilityRole).toBe('alert');
    expect(banner.props.accessibilityLiveRegion).toBe('polite');
    expect(announce).toHaveBeenCalledWith(
      'No internet connection. Showing saved data.'
    );

    act(() => listener?.(netState(true, true)));
    expect(screen.queryByTestId('offline-banner')).toBeNull();

    announce.mockRestore();
  });
});
