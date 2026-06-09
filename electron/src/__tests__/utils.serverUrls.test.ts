import { getServerPort, getServerUrl, getServerWebSocketUrl, checkPermissions, fileExists } from '../utils';
import { serverState } from '../state';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('../state', () => ({
  serverState: { serverPort: undefined as number | undefined }
}));

describe('getServerPort', () => {
  it('returns 7777 when serverPort is undefined', () => {
    serverState.serverPort = undefined;
    expect(getServerPort()).toBe(7777);
  });

  it('returns the configured port', () => {
    serverState.serverPort = 8080;
    expect(getServerPort()).toBe(8080);
  });
});

describe('getServerUrl', () => {
  beforeEach(() => {
    serverState.serverPort = 7777;
  });

  it('returns base URL with no path', () => {
    expect(getServerUrl()).toBe('http://127.0.0.1:7777');
  });

  it('appends a path', () => {
    expect(getServerUrl('/api/health')).toBe('http://127.0.0.1:7777/api/health');
  });

  it('uses the configured port', () => {
    serverState.serverPort = 9090;
    expect(getServerUrl('/test')).toBe('http://127.0.0.1:9090/test');
  });
});

describe('getServerWebSocketUrl', () => {
  beforeEach(() => {
    serverState.serverPort = 7777;
  });

  it('returns ws:// base URL with no path', () => {
    expect(getServerWebSocketUrl()).toBe('ws://127.0.0.1:7777');
  });

  it('appends a path', () => {
    expect(getServerWebSocketUrl('/ws')).toBe('ws://127.0.0.1:7777/ws');
  });

  it('uses the configured port', () => {
    serverState.serverPort = 3000;
    expect(getServerWebSocketUrl('/ws')).toBe('ws://127.0.0.1:3000/ws');
  });
});

describe('checkPermissions', () => {
  it('returns accessible: true for a readable file', async () => {
    const tmpFile = path.join(os.tmpdir(), `nodetool-test-${Date.now()}.txt`);
    fs.writeFileSync(tmpFile, 'test');
    try {
      const result = await checkPermissions(tmpFile, fs.constants.R_OK);
      expect(result.accessible).toBe(true);
      expect(result.error).toBeNull();
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it('returns accessible: false for a non-existent file', async () => {
    const result = await checkPermissions('/tmp/nodetool-nonexistent-file-xyz', fs.constants.F_OK);
    expect(result.accessible).toBe(false);
    expect(result.error).toContain('ENOENT');
  });
});

describe('fileExists', () => {
  it('returns true for an existing file', async () => {
    const tmpFile = path.join(os.tmpdir(), `nodetool-exists-${Date.now()}.txt`);
    fs.writeFileSync(tmpFile, 'test');
    try {
      expect(await fileExists(tmpFile)).toBe(true);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it('returns false for a non-existent file', async () => {
    expect(await fileExists('/tmp/nodetool-does-not-exist-xyz')).toBe(false);
  });
});
