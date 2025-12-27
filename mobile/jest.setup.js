import '@testing-library/jest-native/extend-expect';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

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

// Mock expo-av for audio/video playback
jest.mock('expo-av', () => ({
  Video: jest.fn().mockImplementation(({ testID, ...props }) => {
    const React = require('react');
    const { View } = require('react-native');
    return React.createElement(View, { testID: testID || 'mock-video', ...props });
  }),
  Audio: {
    Sound: {
      createAsync: jest.fn().mockResolvedValue({
        sound: {
          playAsync: jest.fn(),
          pauseAsync: jest.fn(),
          unloadAsync: jest.fn(),
          setOnPlaybackStatusUpdate: jest.fn(),
        },
        status: { isLoaded: true, durationMillis: 60000 },
      }),
    },
    setAudioModeAsync: jest.fn(),
  },
  ResizeMode: {
    CONTAIN: 'contain',
    COVER: 'cover',
    STRETCH: 'stretch',
  },
}));

// Mock react-syntax-highlighter
jest.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({
  atomDark: {},
  tomorrow: {},
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
