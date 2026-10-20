/**
 * Tests for GamePlayerScreen: what the web view is pointed at, what it is
 * allowed to load, and how loading, failure and backgrounding are handled.
 *
 * The web view is replaced by a component that records its props, so a test
 * can play the page's side of the bridge by calling `onMessage` itself.
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';

import GamePlayerScreen, { GAME_START_TIMEOUT_MS } from '../GamePlayerScreen';
import { GAME_PLAYER_BRIDGE_SCRIPT, GAME_PLAYER_PAUSE_SCRIPT } from '../../components/game/gamePlayerBridge';

type WebViewProps = Record<string, unknown> & {
  source: { uri: string };
  onMessage: (event: { nativeEvent: { url: string; data: string } }) => void;
  onShouldStartLoadWithRequest: (request: { url: string }) => boolean;
  onLoadEnd: () => void;
  onHttpError: (event: { nativeEvent: { statusCode: number } }) => void;
  onRenderProcessGone: () => void;
};

let mockWebViewProps: WebViewProps | null = null;
const mockInject = jest.fn();

jest.mock('react-native-webview', () => {
  const { forwardRef, useImperativeHandle } = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const WebView = forwardRef<unknown, Record<string, unknown>>((props, ref) => {
    mockWebViewProps = props as WebViewProps;
    useImperativeHandle(ref, () => ({ injectJavaScript: mockInject }));
    return <View testID="game-player-webview" />;
  });
  return { WebView };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(effect, [effect]);
  },
}));

const lifecycle: { onBackground?: () => void } = {};
jest.mock('../../hooks/useAppLifecycle', () => ({
  useAppLifecycle: (handlers: { onBackground?: () => void }) => {
    lifecycle.onBackground = handlers.onBackground;
    return 'active';
  },
}));

jest.mock('../../services/apiHost', () => ({ getApiHost: () => 'https://api.example.test' }));

const PATH = '/api/game-play/eyJ2IjoxfQ.c2ln/index.html';
const BASE = 'https://api.example.test/api/game-play/eyJ2IjoxfQ.c2ln/';
const mockPlaySession = jest.fn();
jest.mock('../../trpc/client', () => ({
  createMobileTRPCClient: () => ({ games: { playSession: { mutate: mockPlaySession } } }),
}));

const navigation = { setOptions: jest.fn(), goBack: jest.fn(), navigate: jest.fn() };

function session(overrides: Record<string, unknown> = {}) {
  return {
    gameId: 'g1',
    name: 'Kindle',
    revision: 'r'.repeat(32),
    dimension: '2d',
    orientation: null,
    path: PATH,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  };
}

async function renderScreen(params: Record<string, unknown> = { gameId: 'g1', name: 'Kindle' }) {
  render(
    <GamePlayerScreen
      navigation={navigation as never}
      route={{ key: 'GamePlayer-1', name: 'GamePlayer', params } as never}
    />
  );
  await act(async () => {});
}

function post(message: unknown, url = `${BASE}index.html`) {
  act(() => {
    mockWebViewProps?.onMessage({ nativeEvent: { url, data: JSON.stringify(message) } });
  });
}

describe('GamePlayerScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWebViewProps = null;
    mockPlaySession.mockResolvedValue(session());
  });

  it('opens the signed play URL with the bridge and nothing outside the session', async () => {
    await renderScreen({ gameId: 'g1', revision: 'a'.repeat(32), name: 'Kindle' });
    expect(mockPlaySession).toHaveBeenCalledWith({ id: 'g1', revision: 'a'.repeat(32) });
    const props = mockWebViewProps!;
    expect(props.source).toEqual({ uri: `${BASE}index.html` });
    expect(props.injectedJavaScriptBeforeContentLoaded).toBe(GAME_PLAYER_BRIDGE_SCRIPT);
    expect(props.originWhitelist).toEqual(['https://api.example.test']);
    expect(props).toMatchObject({
      setSupportMultipleWindows: false,
      javaScriptCanOpenWindowsAutomatically: false,
      allowFileAccess: false,
      sharedCookiesEnabled: false,
      incognito: true,
    });
    expect(props.onShouldStartLoadWithRequest({ url: `${BASE}assets/a.png` })).toBe(true);
    expect(props.onShouldStartLoadWithRequest({ url: 'https://api.example.test/api/workflows' })).toBe(false);
    expect(props.onShouldStartLoadWithRequest({ url: 'https://evil.example/' })).toBe(false);
    // The page source never carries the user's credentials.
    expect(JSON.stringify(props.source)).not.toMatch(/Bearer|access_token/);
  });

  it('shows the player status while loading and drops the overlay once ready', async () => {
    await renderScreen();
    expect(screen.getByText('Loading the game')).toBeTruthy();
    post({ type: 'status', text: 'Loading assets' });
    expect(screen.getByText('Loading assets')).toBeTruthy();
    // A message from a page outside the session is ignored.
    post({ type: 'ready' }, 'https://evil.example/');
    expect(screen.getByText('Loading assets')).toBeTruthy();
    post({ type: 'ready' });
    expect(screen.queryByText('Loading assets')).toBeNull();
    expect(screen.getByLabelText('Close game')).toBeTruthy();
  });

  it('turns to the orientation the game is drawn for', async () => {
    mockPlaySession.mockResolvedValue(session({ dimension: '3d', orientation: 'landscape' }));
    await renderScreen();
    expect(navigation.setOptions).toHaveBeenCalledWith({ orientation: 'landscape' });
    navigation.setOptions.mockClear();
    // A 3D game's document already fixed its orientation, so the page's layout does not override it.
    post({ type: 'layout', landscape: false });
    expect(navigation.setOptions).not.toHaveBeenCalledWith({ orientation: 'portrait' });
  });

  it("follows a 2D game's layout", async () => {
    await renderScreen();
    post({ type: 'layout', landscape: true });
    expect(navigation.setOptions).toHaveBeenCalledWith({ orientation: 'landscape' });
  });

  it('refuses a 3D game on a web view without WebGL2, instead of a blank screen', async () => {
    mockPlaySession.mockResolvedValue(session({ dimension: '3d', orientation: 'landscape' }));
    await renderScreen();
    post({ type: 'capabilities', webgl2: false, webgpu: false, secureContext: true });
    expect(screen.getByText("This game can't run here")).toBeTruthy();
    expect(screen.getByText(/needs WebGL2/)).toBeTruthy();
    expect(screen.queryByTestId('game-player-webview')).toBeNull();
    expect(screen.queryByText('Try again')).toBeNull();
  });

  it('pauses the game when the app goes to the background', async () => {
    await renderScreen();
    post({ type: 'ready' });
    act(() => lifecycle.onBackground?.());
    expect(mockInject).toHaveBeenCalledWith(GAME_PLAYER_PAUSE_SCRIPT);
  });

  it('fails with the last status when the page never starts the player', async () => {
    jest.useFakeTimers();
    try {
      await renderScreen();
      act(() => mockWebViewProps?.onLoadEnd());
      post({ type: 'status', text: 'This game requires WebGPU effects, which are unavailable on this device' });
      act(() => { jest.advanceTimersByTime(GAME_START_TIMEOUT_MS); });
      expect(screen.getByText("The game didn't start")).toBeTruthy();
      expect(screen.getByText(/requires WebGPU effects/)).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('asks for a new play URL after an expired link', async () => {
    await renderScreen();
    act(() => mockWebViewProps?.onHttpError({ nativeEvent: { statusCode: 404 } }));
    expect(screen.getByText(/play link expired/)).toBeTruthy();
    fireEvent.press(screen.getByText('Try again'));
    await act(async () => {});
    expect(mockPlaySession).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('game-player-webview')).toBeTruthy();
  });

  it('offers a retry when the web view process is gone', async () => {
    await renderScreen();
    act(() => mockWebViewProps?.onRenderProcessGone());
    expect(screen.getByText('The game stopped')).toBeTruthy();
    fireEvent.press(screen.getByText('Go back'));
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('reports a session the server refused', async () => {
    mockPlaySession.mockRejectedValue(new Error('Game not found'));
    await renderScreen();
    expect(screen.getByText("Couldn't open the game")).toBeTruthy();
    expect(screen.queryByTestId('game-player-webview')).toBeNull();
  });

  it('refuses a play path of another shape', async () => {
    mockPlaySession.mockResolvedValue(session({ path: 'https://evil.example/index.html' }));
    await renderScreen();
    expect(screen.getByText(/unexpected player address/)).toBeTruthy();
    expect(screen.queryByTestId('game-player-webview')).toBeNull();
  });
});
