/**
 * Plays one published game in a web view.
 *
 * The game is the exported web player, the same build `export-zip` ships, run
 * unchanged: the shared game runtime and renderers draw it, and touch, audio
 * and the fixed-step simulation all happen inside the page. This screen owns
 * the parts a phone adds around it: getting a play URL, loading and failure
 * states, orientation, back, and pausing when the app or the screen goes
 * away.
 *
 * The server answers `games.playSession` with a short-lived signed URL for the
 * revision's build. That URL is the page's only credential; the user's own
 * token never reaches the web view, and navigation outside the session's
 * directory is refused. See docs/game-engine/mobile-player.md.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';

import type { RootStackParamList } from '../navigation/types';
import { createMobileTRPCClient } from '../trpc/client';
import { getApiHost } from '../services/apiHost';
import { useAppLifecycle } from '../hooks/useAppLifecycle';
import { ErrorState } from '../components/ScreenState';
import {
  GAME_PLAYER_BRIDGE_SCRIPT,
  GAME_PLAYER_PAUSE_SCRIPT,
  gamePlayBaseUrl,
  isGamePlayUrl,
  parseGamePlayerMessage,
  unsupportedReason,
} from '../components/game/gamePlayerBridge';
import { FONT_SIZE, HIT_SLOP, MIN_TOUCH_TARGET, RADIUS, SPACING } from '../utils/tokens';

type GamePlayerScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'GamePlayer'>;
  route: RouteProp<RootStackParamList, 'GamePlayer'>;
};

/** How long a loaded page may take to report a started player before the screen calls it failed. */
export const GAME_START_TIMEOUT_MS = 60_000;

interface PlaySession {
  url: string;
  baseUrl: string;
  dimension: '2d' | '3d';
  orientation: 'landscape' | 'portrait' | null;
}

type Phase =
  | { kind: 'requesting' }
  | { kind: 'loading'; session: PlaySession; status: string | null }
  | { kind: 'playing'; session: PlaySession }
  | { kind: 'failed'; title: string; message: string; retry: boolean };

// The page draws its own dark stage, so the frame around it stays black in both themes.
const STAGE_BACKGROUND = '#000000';
const OVERLAY_TEXT = '#FFFFFF';
const OVERLAY_SCRIM = '#000000AA';

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'The game could not be prepared.';
}

export default function GamePlayerScreen({ navigation, route }: GamePlayerScreenProps) {
  const { gameId, revision, name } = route.params;
  const insets = useSafeAreaInsets();
  const webView = useRef<WebView>(null);
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<Phase>({ kind: 'requesting' });
  const sessionRef = useRef<PlaySession | null>(null);
  const lastStatus = useRef<string | null>(null);
  const failed = phase.kind === 'failed';

  useLayoutEffect(() => {
    navigation.setOptions({ title: name ?? 'Game' });
  }, [navigation, name]);

  // Mint a fresh play URL per attempt. A retry after a failure or an expired link always asks again.
  useEffect(() => {
    let cancelled = false;
    setPhase({ kind: 'requesting' });
    sessionRef.current = null;
    lastStatus.current = null;
    void createMobileTRPCClient()
      .games.playSession.mutate(revision ? { id: gameId, revision } : { id: gameId })
      .then((answer) => {
        if (cancelled) {
          return;
        }
        const baseUrl = gamePlayBaseUrl(getApiHost(), answer.path);
        if (!baseUrl) {
          setPhase({ kind: 'failed', title: "Couldn't open the game", message: 'The server answered with an unexpected player address.', retry: false });
          return;
        }
        const session: PlaySession = {
          url: `${baseUrl}index.html`,
          baseUrl,
          dimension: answer.dimension,
          orientation: answer.orientation,
        };
        sessionRef.current = session;
        if (session.orientation) {
          navigation.setOptions({ orientation: session.orientation });
        }
        setPhase({ kind: 'loading', session, status: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setPhase({ kind: 'failed', title: "Couldn't open the game", message: errorMessage(error), retry: true });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [gameId, revision, attempt, navigation]);

  const fail = useCallback((title: string, message: string, retry = true) => {
    setPhase({ kind: 'failed', title, message, retry });
  }, []);

  // A page that loaded but never started its player is a failure, named with the player's own last status line.
  const [pageLoaded, setPageLoaded] = useState(false);
  useEffect(() => {
    setPageLoaded(false);
  }, [attempt]);
  useEffect(() => {
    if (phase.kind !== 'loading' || !pageLoaded) {
      return undefined;
    }
    const timer = setTimeout(() => {
      fail("The game didn't start", lastStatus.current ?? 'The player did not report that it started.');
    }, GAME_START_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [phase.kind, pageLoaded, fail]);

  const pause = useCallback(() => {
    webView.current?.injectJavaScript(GAME_PLAYER_PAUSE_SCRIPT);
  }, []);

  // Backgrounding pauses the game and its audio and lets go of every held control. It stays paused on return,
  // so play resumes when the player taps Resume rather than the moment the app reappears.
  useAppLifecycle({ onBackground: pause });
  useFocusEffect(
    useCallback(() => () => pause(), [pause])
  );

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const session = sessionRef.current;
      if (!session || !isGamePlayUrl(event.nativeEvent.url, session.baseUrl)) {
        return;
      }
      const message = parseGamePlayerMessage(event.nativeEvent.data);
      if (!message) {
        return;
      }
      switch (message.type) {
        case 'capabilities': {
          const reason = unsupportedReason(session.dimension, message);
          if (reason) {
            fail("This game can't run here", reason, false);
          }
          break;
        }
        case 'status':
          lastStatus.current = message.text;
          setPhase((current) => (current.kind === 'loading' ? { ...current, status: message.text } : current));
          break;
        case 'layout':
          // A 2D game's camera decides its shape once the first frame exists.
          if (!session.orientation) {
            navigation.setOptions({ orientation: message.landscape ? 'landscape' : 'portrait' });
          }
          break;
        case 'ready':
          setPhase((current) => (current.kind === 'loading' ? { kind: 'playing', session: current.session } : current));
          break;
        case 'error':
          lastStatus.current = message.message;
          break;
      }
    },
    [fail, navigation]
  );

  const onShouldStartLoadWithRequest = useCallback((request: WebViewNavigation) => {
    const session = sessionRef.current;
    return session !== null && isGamePlayUrl(request.url, session.baseUrl);
  }, []);

  const retry = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  const session = phase.kind === 'loading' || phase.kind === 'playing' ? phase.session : null;

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      {session && !failed ? (
        <WebView
          key={`${attempt}`}
          ref={webView}
          testID="game-player-webview"
          source={{ uri: session.url }}
          style={styles.webView}
          originWhitelist={[new URL(session.baseUrl).origin]}
          onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
          injectedJavaScriptBeforeContentLoaded={GAME_PLAYER_BRIDGE_SCRIPT}
          onMessage={onMessage}
          onLoadEnd={() => setPageLoaded(true)}
          onError={(event) => fail("Couldn't load the game", event.nativeEvent.description || 'The player page did not load.')}
          onHttpError={(event) =>
            fail(
              "Couldn't load the game",
              event.nativeEvent.statusCode === 404
                ? 'The play link expired or the game is no longer available.'
                : `The server answered ${event.nativeEvent.statusCode}.`
            )
          }
          onContentProcessDidTerminate={() => fail('The game stopped', 'The web view closed the game, often to free memory.')}
          onRenderProcessGone={() => fail('The game stopped', 'The web view closed the game, often to free memory.')}
          // Nothing outside the session: no new windows, no files, no shared cookies, no back-forward swipes.
          setSupportMultipleWindows={false}
          javaScriptCanOpenWindowsAutomatically={false}
          allowFileAccess={false}
          allowFileAccessFromFileURLs={false}
          allowUniversalAccessFromFileURLs={false}
          allowsBackForwardNavigationGestures={false}
          sharedCookiesEnabled={false}
          thirdPartyCookiesEnabled={false}
          // A private data store, so one account's saved games are never read under another.
          incognito
          allowsLinkPreview={false}
          dataDetectorTypes="none"
          // Games start audio from a tap, and play inline rather than in a system player.
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
          setBuiltInZoomControls={false}
          hideKeyboardAccessoryView
          webviewDebuggingEnabled={__DEV__}
        />
      ) : null}
      {phase.kind === 'requesting' || phase.kind === 'loading' ? (
        <View style={[StyleSheet.absoluteFill, styles.overlay]} pointerEvents="none" accessibilityLiveRegion="polite">
          <ActivityIndicator color={OVERLAY_TEXT} accessibilityLabel="Loading game" />
          <Text style={styles.overlayText} numberOfLines={3}>
            {phase.kind === 'requesting' ? 'Preparing the game' : phase.status ?? 'Loading the game'}
          </Text>
        </View>
      ) : null}
      {phase.kind === 'failed' ? (
        <ErrorState
          title={phase.title}
          message={phase.message}
          onRetry={phase.retry ? retry : undefined}
          retryLabel="Load the game again"
          secondaryAction={{ label: 'Go back', icon: 'arrow-back', onPress: () => navigation.goBack() }}
        />
      ) : null}
      {!failed ? (
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Close game"
          hitSlop={HIT_SLOP}
          style={[styles.close, { top: insets.top + SPACING.sm, left: insets.left + SPACING.sm }]}
        >
          <Ionicons name="close" size={22} color={OVERLAY_TEXT} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: STAGE_BACKGROUND,
  },
  webView: {
    flex: 1,
    backgroundColor: STAGE_BACKGROUND,
  },
  overlay: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
    padding: SPACING.xl,
    backgroundColor: STAGE_BACKGROUND,
  },
  overlayText: {
    color: OVERLAY_TEXT,
    fontSize: FONT_SIZE.body,
    textAlign: 'center',
  },
  close: {
    position: 'absolute',
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: OVERLAY_SCRIM,
  },
});
