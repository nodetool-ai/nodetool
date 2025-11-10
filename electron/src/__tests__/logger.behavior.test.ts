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

    const mkdirMock = jest.fn().mockResolvedValue(undefined);
    const appendFileMock = jest.fn().mockResolvedValue(undefined);
    jest.doMock('fs', () => ({
      promises: {
        mkdir: mkdirMock,
        appendFile: appendFileMock,
      },
    }));

    const emitServerLogMock = jest.fn();
    jest.doMock('../events', () => ({
      emitServerLog: emitServerLogMock,
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

    await loggerModule.logMessage('  hello world  ');

    expect(electronLogSpies.info).toHaveBeenCalledWith('hello world');
    expect(emitServerLogMock).toHaveBeenCalledWith('hello world');
    expect(getSystemDataPathMock).toHaveBeenCalledWith(
      path.join('logs', 'nodetool.log'),
    );
    expect(mkdirMock).toHaveBeenCalledWith(
      path.join('/mock/system', 'logs'),
      { recursive: true },
    );
    expect(appendFileMock).toHaveBeenCalledWith(
      loggerModule.LOG_FILE,
      'hello world\n',
    );
  });

  it('continues when file system operations fail and logs errors', async () => {
    jest.unmock('../logger');

    const mkdirError = new Error('mkdir failed');
    const appendError = new Error('append failed');
    const mkdirMock = jest.fn().mockRejectedValue(mkdirError);
    const appendFileMock = jest.fn().mockRejectedValue(appendError);
    jest.doMock('fs', () => ({
      promises: {
        mkdir: mkdirMock,
        appendFile: appendFileMock,
      },
    }));

    const emitServerLogMock = jest.fn();
    jest.doMock('../events', () => ({
      emitServerLog: emitServerLogMock,
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

    await expect(loggerModule.logMessage('issue detected', 'error')).resolves.toBeUndefined();

    expect(electronLogSpies.error).toHaveBeenCalledWith('issue detected');
    expect(emitServerLogMock).toHaveBeenCalledWith('issue detected');
    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to create log directory:', mkdirError);
    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to write to log file:', appendError);

    consoleErrorSpy.mockRestore();
  });
});
