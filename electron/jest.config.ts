const isCi = process.env.CI === 'true';

export default {
  // GitHub-hosted runners can OOM when ts-jest compiles many Electron test
  // workers concurrently. Keep CI parallelism bounded and cap worker memory
  // to prevent ipc.test.ts (28 KB, many mocks) from triggering SIGKILL.
  ...(isCi ? { maxWorkers: 2, workerIdleMemoryLimit: '512MB' } : {}),
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/src/__mocks__/setup.ts'],
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': '<rootDir>/src/__mocks__/styleMock.ts',
    '\\.(jpg|jpeg|png|gif|webp|svg)$': '<rootDir>/src/__mocks__/fileMock.ts',
    '^@nodetool-ai/protocol$': '<rootDir>/src/__mocks__/protocol.ts',
    '^@nodetool-ai/protocol/bridge-protocol$': '<rootDir>/../packages/protocol/src/bridge-protocol.ts',
    '^@nodetool-ai/websocket/trpc$': '<rootDir>/src/__mocks__/websocket-trpc.ts',
    '^superjson$': '<rootDir>/src/__mocks__/superjson.ts',
    '^@nodetool-ai/config$': '<rootDir>/../packages/config/src/index.ts',
    '^@nodetool-ai/config/(.*)$': '<rootDir>/../packages/config/src/$1',
    // Strip .js extensions from TypeScript ESM imports
    '^(\\.{1,2}/.+)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.test.json',
      diagnostics: {
        ignoreCodes: [2307, 2339, 2344, 2345]
      }
    }],
  },
  testRegex: '(/__tests__/.*|(\\.|/)(test|spec))\\.(jsx?|tsx?)$',
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  modulePathIgnorePatterns: [
    '<rootDir>/backend-bundle/',
    '<rootDir>/dist/',
  ],
  collectCoverageFrom: [
    'src/**/*.{js,ts}',
    '!src/**/*.d.ts',
    '!src/preload*.ts',
  ],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/coverage/',
    '/dist/',
    '/dist-electron/',
    '/dist-web/',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/dist-electron/',
    '/dist-web/',
    '/tests/e2e/',
  ],
}
