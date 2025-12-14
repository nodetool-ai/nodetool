import path from 'path';

describe('logger.logMessage', () => {
  const originalConsoleError = console.error;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  it('logs messages, emits server log events, and writes to file', async () => {
    jest.unmock('../logger');

    const writeMock = jest.fn();
    const onMock = jest.fn();
    const createWriteStreamMock = jest.fn().mockReturnValue({
      destroyed: false,
      write: writeMock,
      on: onMock,
    });
    const existsSyncMock = jest.fn().mockReturnValue(false);
    const mkdirSyncMock = jest.fn();
    jest.doMock('fs', () => ({
      createWriteStream: createWriteStreamMock,
      existsSync: existsSyncMock,
      mkdirSync: mkdirSyncMock,
    }));

    const electronLogSpies = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    jest.doMock('electron-log', () => electronLogSpies);

    const getSystemDataPathMock = jest
      .fn()
      .mockImplementation((relativePath: string) =>
        path.join('/mock/system', relativePath),
      );
    jest.doMock('../config', () => ({
      getSystemDataPath: getSystemDataPathMock,
    }));

    const loggerModule = await import('../logger');

    loggerModule.logMessage('  hello world  ');

    expect(electronLogSpies.info).toHaveBeenCalledWith('hello world');
    expect(getSystemDataPathMock).toHaveBeenCalledWith(
      path.join('logs', 'nodetool.log'),
    );
    expect(existsSyncMock).toHaveBeenCalledWith(path.join('/mock/system', 'logs'));
    expect(mkdirSyncMock).toHaveBeenCalledWith(path.join('/mock/system', 'logs'), {
      recursive: true,
    });
    expect(createWriteStreamMock).toHaveBeenCalledWith(loggerModule.LOG_FILE, {
      flags: 'a',
    });
    expect(writeMock).toHaveBeenCalledWith('hello world\n');
    expect(onMock).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('continues when file system operations fail and logs errors', async () => {
    jest.unmock('../logger');

    const streamError = new Error('stream failed');
    const createWriteStreamMock = jest.fn(() => {
      throw streamError;
    });
    const existsSyncMock = jest.fn().mockReturnValue(true);
    const mkdirSyncMock = jest.fn();
    jest.doMock('fs', () => ({
      createWriteStream: createWriteStreamMock,
      existsSync: existsSyncMock,
      mkdirSync: mkdirSyncMock,
    }));

    const electronLogSpies = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    jest.doMock('electron-log', () => electronLogSpies);

    const getSystemDataPathMock = jest
      .fn()
      .mockImplementation((relativePath: string) =>
        path.join('/mock/system', relativePath),
      );
    jest.doMock('../config', () => ({
      getSystemDataPath: getSystemDataPathMock,
    }));

    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const loggerModule = await import('../logger');

    expect(() => loggerModule.logMessage('issue detected', 'error')).not.toThrow();

    expect(electronLogSpies.error).toHaveBeenCalledWith('issue detected');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to create log stream:',
      streamError,
    );

    consoleErrorSpy.mockRestore();
  });
});
