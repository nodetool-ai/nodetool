/** @type {import('jest').Config} */
module.exports = {
  preset: 'react-native',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/'],
  testMatch: ['**/__tests__/**/*.[jt]s?(x)', '**/?(*.)+(spec|test).[jt]s?(x)'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  collectCoverageFrom: [
    'src/components/chat/**/*.{ts,tsx}',
    'src/stores/ChatStore.{ts,tsx}',
    'src/services/WebSocketManager.{ts,tsx}',
    'src/screens/ChatScreen.{ts,tsx}',
    'src/hooks/useFileHandling.{ts,tsx}',
    '!**/*.d.ts',
    '!**/index.{ts,tsx}',
    '!**/*.test.{ts,tsx}',
  ],
  coverageThreshold: {
    global: {
      branches: 78,
      functions: 88,
      lines: 86,
      statements: 86,
    },
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|react-native-markdown-display|zustand)',
  ],
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': 'babel-jest',
  },
};
