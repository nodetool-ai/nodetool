/**
 * Tests for SettingsScreen — switching servers drops the old host's socket,
 * the scroll content clears the home indicator, and pending indicator timers
 * die with the screen.
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';

import SettingsScreen from '../SettingsScreen';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}));

const mockHost = { current: 'http://old-host:7777' };
const mockApi = {
  loadApiHost: jest.fn(async (): Promise<string> => mockHost.current),
  getApiHost: jest.fn((): string => mockHost.current),
  saveApiHost: jest.fn(async (host: string): Promise<void> => {
    mockHost.current = host;
  }),
};

jest.mock('../../services/api', () => ({
  apiService: {
    loadApiHost: () => mockApi.loadApiHost(),
    getApiHost: () => mockApi.getApiHost(),
    saveApiHost: (host: string) => mockApi.saveApiHost(host),
  },
}));

const mockDisconnect = jest.fn();
jest.mock('../../services/WebSocketService', () => ({
  webSocketService: { disconnect: () => mockDisconnect() },
}));

const mockClear = jest.fn();
jest.mock('../../queryClient', () => ({
  queryClient: { clear: () => mockClear() },
}));

jest.mock('../../services/serverDiagnostics', () => ({
  diagnoseServer: jest.fn(),
}));

jest.mock('../../stores/AuthStore', () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ user: null, state: 'logged_in', signOut: jest.fn() }),
}));

describe('SettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHost.current = 'http://old-host:7777';
  });

  it('drops the socket and cached queries when the host changes', async () => {
    render(<SettingsScreen />);
    const input = await screen.findByLabelText('API host URL');

    fireEvent.changeText(input, 'http://new-host:7777');
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Save settings'));
    });

    expect(mockApi.saveApiHost).toHaveBeenCalledWith('http://new-host:7777');
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
    expect(mockClear).toHaveBeenCalled();
  });

  it('keeps the socket when the same host is saved again', async () => {
    render(<SettingsScreen />);
    await screen.findByLabelText('API host URL');

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Save settings'));
    });

    expect(mockApi.saveApiHost).toHaveBeenCalledWith('http://old-host:7777');
    expect(mockDisconnect).not.toHaveBeenCalled();
  });

  it('pads the scroll content past the bottom safe area', async () => {
    const { UNSAFE_getByType } = render(<SettingsScreen />);
    await screen.findByLabelText('API host URL');
    const { ScrollView } = jest.requireActual<typeof import('react-native')>('react-native');

    const contentStyle = UNSAFE_getByType(ScrollView).props.contentContainerStyle;
    const flat = Object.assign({}, ...[contentStyle].flat(2));
    expect(flat.paddingBottom).toBeGreaterThanOrEqual(34);
  });

  it('clears the saved-indicator timer on unmount', async () => {
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
    try {
      const { unmount } = render(<SettingsScreen />);
      await screen.findByLabelText('API host URL');
      await act(async () => {
        fireEvent.press(screen.getByLabelText('Save settings'));
      });
      const call = setTimeoutSpy.mock.calls.findIndex(([, ms]) => ms === 2000);
      expect(call).toBeGreaterThanOrEqual(0);
      const timer = setTimeoutSpy.mock.results[call].value;

      unmount();

      expect(clearTimeoutSpy).toHaveBeenCalledWith(timer);
    } finally {
      setTimeoutSpy.mockRestore();
      clearTimeoutSpy.mockRestore();
    }
  });
});
