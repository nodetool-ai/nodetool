/** @type {import('jest').Config} */
module.exports = {
  preset: '@react-native/jest-preset',
  testEnvironment: 'node',
  // Use V8's built-in coverage rather than babel-plugin-istanbul. Istanbul's
  // instrumentation pulls in a `test-exclude`/`minimatch` combination that is
  // incompatible with the hoisted minimatch v9 in this monorepo (it calls
  // minimatch as a default-callable function, which v9 no longer exports),
  // which makes `--coverage` crash. V8 coverage sidesteps that toolchain.
  coverageProvider: 'v8',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/'],
  testMatch: ['**/__tests__/**/*.[jt]s?(x)', '**/?(*.)+(spec|test).[jt]s?(x)'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  moduleNameMapper: {
    '^expo-clipboard$': '<rootDir>/__mocks__/expo-clipboard.js',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/*.test.{ts,tsx}',
    '!**/index.{ts,tsx}',
    // Type-only and generated code carry no runnable logic.
    '!src/types/**',
    '!src/api.ts',
  ],
  // Thresholds are set below the currently-measured V8 coverage
  // (~29% statements/lines, ~80% branches, ~58% functions) so the gate is
  // honest and enforceable — it fails on regressions without lying about
  // how much is actually covered. Raise these as coverage grows.
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 50,
      lines: 25,
      statements: 25,
    },
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|react-native-markdown-display|zustand)',
  ],
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': 'babel-jest',
  },
};
