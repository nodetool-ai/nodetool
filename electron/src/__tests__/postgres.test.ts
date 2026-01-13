import {
  isPostgresResponsive,
  isPostgresRunning,
  getPostgresConnectionUrl,
  DEFAULT_POSTGRES_PORT,
  POSTGRES_DATABASE,
  POSTGRES_USER,
} from '../postgres';

// Mock dependencies
jest.mock('../logger', () => ({
  logMessage: jest.fn(),
}));

jest.mock('../config', () => ({
  getPostgresPath: jest.fn(() => '/mock/bin/postgres'),
  getPgCtlPath: jest.fn(() => '/mock/bin/pg_ctl'),
  getInitDbPath: jest.fn(() => '/mock/bin/initdb'),
  getPsqlPath: jest.fn(() => '/mock/bin/psql'),
  getPostgresDataPath: jest.fn(() => '/mock/data/postgres_data'),
  getProcessEnv: jest.fn(() => ({ PATH: '/mock/path' })),
  PID_DIRECTORY: '/mock/pid',
  getCondaEnvPath: jest.fn(() => '/mock/conda'),
}));

jest.mock('../events', () => ({
  emitServerLog: jest.fn(),
}));

jest.mock('../state', () => ({
  serverState: {
    postgresPort: 7778,
  },
}));

jest.mock('../watchdog', () => ({
  Watchdog: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stopGracefully: jest.fn(),
  })),
}));

describe('postgres module', () => {
  describe('constants', () => {
    it('should have correct default port', () => {
      expect(DEFAULT_POSTGRES_PORT).toBe(7778);
    });

    it('should have correct database name', () => {
      expect(POSTGRES_DATABASE).toBe('nodetool');
    });

    it('should have correct user name', () => {
      expect(POSTGRES_USER).toBe('nodetool');
    });
  });

  describe('getPostgresConnectionUrl', () => {
    it('should return correct connection URL', () => {
      const url = getPostgresConnectionUrl();
      expect(url).toBe('postgresql://nodetool@127.0.0.1:7778/nodetool');
    });
  });

  describe('isPostgresRunning', () => {
    it('should return false when watchdog is not started', () => {
      expect(isPostgresRunning()).toBe(false);
    });
  });

  describe('isPostgresResponsive', () => {
    it('should return false when no server is listening', async () => {
      // Use a random high port that's unlikely to be in use
      const result = await isPostgresResponsive(59999, 100);
      expect(result).toBe(false);
    });
  });
});
