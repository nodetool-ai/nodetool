const isCi = process.env.CI === 'true';
const configuredWorkers = process.env.NODETOOL_TEST_WORKERS;
if (configuredWorkers && (!/^[1-9]\d*$/.test(configuredWorkers) || !Number.isSafeInteger(Number(configuredWorkers)))) {
  throw new Error('NODETOOL_TEST_WORKERS must be a positive integer.');
}

export default {
  // GitHub-hosted runners (7 GB RAM) OOM-kill ts-jest workers when several
  // large Electron test files compile in parallel. Keep local runs small too.
  maxWorkers: configuredWorkers ? Number(configuredWorkers) : isCi ? 1 : 2,
  workerIdleMemoryLimit: '1GB',
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/src/__mocks__/setup.ts'],
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': '<rootDir>/src/__mocks__/styleMock.ts',
    '\\.(jpg|jpeg|png|gif|webp|svg)$': '<rootDir>/src/__mocks__/fileMock.ts',
    '^@nodetool-ai/protocol$': '<rootDir>/src/__mocks__/protocol.ts',
    '^@nodetool-ai/protocol/bridge-protocol$': '<rootDir>/../packages/protocol/src/bridge-protocol.ts',
    '^@nodetool-ai/protocol/builtin-packs$': '<rootDir>/../packages/protocol/src/builtin-packs.ts',
    '^@nodetool-ai/protocol/sandbox-package$': '<rootDir>/../packages/protocol/src/sandbox-package.ts',
    '^@nodetool-ai/node-sdk/sandbox-pack-discovery$': '<rootDir>/../packages/node-sdk/src/sandbox-pack-discovery.ts',
    '^@nodetool-ai/websocket/trpc$': '<rootDir>/src/__mocks__/websocket-trpc.ts',
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
    // The downloaded Node runtime. Gitignored, which Jest does not read, so
    // without this it collects npm's own `lib/commands/test.js` as a suite.
    '<rootDir>/.node-runtime/',
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
    '/\\.node-runtime/',
  ],
}
