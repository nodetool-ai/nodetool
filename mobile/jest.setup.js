import '@testing-library/react-native/build/matchers/extend-expect';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mock react-native-url-polyfill (side-effect import in services/supabase.ts)
jest.mock('react-native-url-polyfill/auto', () => ({}));

// Mock expo-secure-store (native keychain not available in Jest) with a simple
// in-memory store so the secureStorage adapter can be exercised.
jest.mock('expo-secure-store', () => {
  const store = new Map();
  return {
    getItemAsync: jest.fn(async (k) => (store.has(k) ? store.get(k) : null)),
    setItemAsync: jest.fn(async (k, v) => {
      store.set(k, v);
    }),
    deleteItemAsync: jest.fn(async (k) => {
      store.delete(k);
    }),
  };
});

// Mock expo-constants (used for Supabase config and app version)
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      version: '1.0.0',
      extra: {},
    },
  },
}));

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-1234'),
}));

// Mock @expo/vector-icons
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  return {
    Ionicons: ({ name, size, color, testID, ...props }) =>
      React.createElement('Icon', {
        testID: testID || `icon-${name}`,
        name,
        size,
        color,
        ...props,
      }),
  };
});

// Mock expo-video for video playback
jest.mock('expo-video', () => ({
  useVideoPlayer: jest.fn(() => ({
    play: jest.fn(),
    pause: jest.fn(),
    replace: jest.fn(),
    loop: false,
  })),
  VideoView: jest.fn().mockImplementation(({ testID, ...props }) => {
    const React = require('react');
    const { View } = require('react-native');
    return React.createElement(View, { testID: testID || 'mock-video', ...props });
  }),
}));

// Mock expo-audio for audio playback and recording. The recording half is here
// because the app_runtime `AudioRecorder` widget reads `RecordingPresets` at
// module scope, so every suite that imports the widget file needs it; a suite
// that drives a recording mocks the module itself.
jest.mock('expo-audio', () => ({
  useAudioPlayer: jest.fn(() => ({
    play: jest.fn(),
    pause: jest.fn(),
    seekTo: jest.fn(),
    replace: jest.fn(),
    remove: jest.fn(),
  })),
  useAudioPlayerStatus: jest.fn(() => ({
    isLoaded: true,
    playing: false,
    currentTime: 0,
    duration: 60,
    didJustFinish: false,
  })),
  setAudioModeAsync: jest.fn(),
  RecordingPresets: {
    HIGH_QUALITY: { extension: '.m4a' },
    LOW_QUALITY: { extension: '.m4a' },
  },
  requestRecordingPermissionsAsync: jest
    .fn()
    .mockResolvedValue({ status: 'granted', granted: true, canAskAgain: true }),
  getRecordingPermissionsAsync: jest
    .fn()
    .mockResolvedValue({ status: 'granted', granted: true, canAskAgain: true }),
  useAudioRecorder: jest.fn(() => ({
    uri: null,
    prepareToRecordAsync: jest.fn().mockResolvedValue(undefined),
    record: jest.fn(),
    stop: jest.fn().mockResolvedValue(undefined),
  })),
  useAudioRecorderState: jest.fn(() => ({
    canRecord: true,
    isRecording: false,
    durationMillis: 0,
    mediaServicesDidReset: false,
    url: null,
  })),
}));

// Mock react-syntax-highlighter. The app deep-imports the two themes it uses
// so the 47-theme barrel stays out of the bundle; mock the same paths.
jest.mock('react-syntax-highlighter/dist/esm/styles/prism/atom-dark', () => ({
  __esModule: true,
  default: {},
}));

jest.mock('react-syntax-highlighter/dist/esm/styles/prism/tomorrow', () => ({
  __esModule: true,
  default: {},
}));

jest.mock('react-native-syntax-highlighter', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ children, language, highlighter, ...props }) =>
      React.createElement(Text, { testID: 'syntax-highlighter', ...props }, children),
  };
});

// Mock expo-image-picker
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  launchImageLibraryAsync: jest.fn().mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///test/image.jpg', type: 'image', fileName: 'test.jpg' }],
  }),
  launchCameraAsync: jest.fn().mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///test/photo.jpg', type: 'image', fileName: 'photo.jpg' }],
  }),
}));

// Mock @react-native-google-signin/google-signin (native module not available in Jest)
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn().mockResolvedValue(true),
    signIn: jest.fn().mockResolvedValue({ data: { idToken: null } }),
    signOut: jest.fn().mockResolvedValue(undefined),
  },
}));

// Mock expo-document-picker
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn().mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///test/document.pdf', name: 'document.pdf', mimeType: 'application/pdf' }],
  }),
}));

// Mock expo-notifications (no notification service in Jest)
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted', granted: true }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted', granted: true }),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('notification-id'),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn().mockResolvedValue(null),
  AndroidImportance: { DEFAULT: 3, HIGH: 4 },
}));

// Mock expo-media-library (no photo library in Jest).
// v56 moved these onto the /legacy subpath — the root re-exports are
// deprecated stubs that throw at runtime — so both specifiers are mocked.
// The factories are written out per specifier rather than shared through a
// variable: babel-plugin-jest-hoist requires an inline function.
jest.mock('expo-media-library', () => ({
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted', granted: true }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted', granted: true }),
  saveToLibraryAsync: jest.fn().mockResolvedValue(undefined),
  createAssetAsync: jest.fn().mockResolvedValue({ id: 'asset-1' }),
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
}));
jest.mock('expo-media-library/legacy', () => ({
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted', granted: true }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted', granted: true }),
  saveToLibraryAsync: jest.fn().mockResolvedValue(undefined),
  createAssetAsync: jest.fn().mockResolvedValue({ id: 'asset-1' }),
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
}));

// Mock expo-file-system (downloads for save-to-library). Same /legacy story.
jest.mock('expo-file-system', () => ({
  cacheDirectory: 'file:///cache/',
  documentDirectory: 'file:///documents/',
  downloadAsync: jest.fn().mockResolvedValue({ uri: 'file:///cache/download.png', status: 200 }),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  documentDirectory: 'file:///documents/',
  downloadAsync: jest.fn().mockResolvedValue({ uri: 'file:///cache/download.png', status: 200 }),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
}));

// Mock expo-speech-recognition (no speech recognizer in Jest)
jest.mock('expo-speech-recognition', () => ({
  ExpoSpeechRecognitionModule: {
    requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted', granted: true }),
    getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted', granted: true }),
    start: jest.fn(),
    stop: jest.fn(),
    abort: jest.fn(),
    getSupportedLocales: jest.fn().mockResolvedValue({ locales: ['en-US'] }),
    isRecognitionAvailable: jest.fn().mockReturnValue(true),
  },
  // A bare no-op: a test that needs native events installs its own
  // implementation to capture listeners. Rendering the composer without one
  // still works — the mic just never transitions.
  useSpeechRecognitionEvent: jest.fn(),
}));

// Mock @sentry/react-native (no crash SDK in Jest)
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  setUser: jest.fn(),
  wrap: jest.fn((component) => component),
}));

// Mock expo-haptics (no taptic engine in Jest)
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

// Mock expo-linking
jest.mock('expo-linking', () => ({
  createURL: jest.fn((path) => `nodetool://${path}`),
  getInitialURL: jest.fn().mockResolvedValue(null),
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  parse: jest.fn(() => ({ path: '', queryParams: {} })),
}));

// Mock @react-native-community/netinfo (no native network module in Jest)
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    addEventListener: jest.fn(() => jest.fn()),
    fetch: jest.fn().mockResolvedValue({ isConnected: true, isInternetReachable: true }),
  },
  addEventListener: jest.fn(() => jest.fn()),
  fetch: jest.fn().mockResolvedValue({ isConnected: true, isInternetReachable: true }),
}));

// Silence console methods to reduce noise in tests
const originalConsole = { ...console };
beforeAll(() => {
  global.console = {
    ...console,
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
});

afterAll(() => {
  global.console = originalConsole;
});
