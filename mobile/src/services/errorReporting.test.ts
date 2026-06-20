import {
  reportError,
  setErrorReporter,
  initErrorReporting,
  __resetErrorReportingForTests,
} from './errorReporting';

type GlobalWithErrorUtils = {
  ErrorUtils?: {
    getGlobalHandler?: () => (e: unknown, fatal?: boolean) => void;
    setGlobalHandler?: (h: (e: unknown, fatal?: boolean) => void) => void;
  };
};

describe('errorReporting', () => {
  afterEach(() => {
    __resetErrorReportingForTests();
    delete (global as unknown as GlobalWithErrorUtils).ErrorUtils;
  });

  it('routes captured errors to the active reporter', () => {
    const capture = jest.fn();
    setErrorReporter({ captureException: capture });

    const err = new Error('boom');
    reportError(err, { source: 'test' });

    expect(capture).toHaveBeenCalledWith(err, { source: 'test' });
  });

  it('wraps a non-Error value in an Error', () => {
    const capture = jest.fn();
    setErrorReporter({ captureException: capture });

    reportError('just a string');

    const arg = capture.mock.calls[0][0] as Error;
    expect(arg).toBeInstanceOf(Error);
    expect(arg.message).toBe('just a string');
  });

  it('does not throw if the reporter itself throws', () => {
    setErrorReporter({
      captureException: () => {
        throw new Error('reporter broke');
      },
    });

    expect(() => reportError(new Error('x'))).not.toThrow();
  });

  it('installs a global handler that reports and chains the previous one', () => {
    const previous = jest.fn();
    let installed: ((e: unknown, fatal?: boolean) => void) | undefined;
    (global as unknown as GlobalWithErrorUtils).ErrorUtils = {
      getGlobalHandler: () => previous,
      setGlobalHandler: (h) => {
        installed = h;
      },
    };
    const capture = jest.fn();
    setErrorReporter({ captureException: capture });

    initErrorReporting();
    expect(installed).toBeDefined();

    const err = new Error('fatal');
    installed!(err, true);

    expect(capture).toHaveBeenCalledWith(err, { source: 'global', fatal: true });
    expect(previous).toHaveBeenCalledWith(err, true);
  });

  it('installs the global handler at most once', () => {
    const setGlobalHandler = jest.fn();
    (global as unknown as GlobalWithErrorUtils).ErrorUtils = {
      getGlobalHandler: () => undefined as never,
      setGlobalHandler,
    };

    initErrorReporting();
    initErrorReporting();

    expect(setGlobalHandler).toHaveBeenCalledTimes(1);
  });
});
