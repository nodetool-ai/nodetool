import {
  reportError,
  setErrorReporter,
  initErrorReporting,
  __resetErrorReportingForTests,
} from './errorReporting';

/** The RN global this module installs onto, named so the doubles stay typed. */
type ErrorUtilsGlobal = {
  getGlobalHandler?: () => (e: unknown, fatal?: boolean) => void;
  setGlobalHandler?: (h: (e: unknown, fatal?: boolean) => void) => void;
};

describe('errorReporting', () => {
  afterEach(() => {
    __resetErrorReportingForTests();
    Reflect.deleteProperty(global, 'ErrorUtils');
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
    const errorUtils: ErrorUtilsGlobal = {
      getGlobalHandler: () => previous,
      setGlobalHandler: (h) => {
        installed = h;
      },
    };
    Reflect.set(global, 'ErrorUtils', errorUtils);
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
    const errorUtils: ErrorUtilsGlobal = {
      getGlobalHandler: () => undefined as never,
      setGlobalHandler,
    };
    Reflect.set(global, 'ErrorUtils', errorUtils);

    initErrorReporting();
    initErrorReporting();

    expect(setGlobalHandler).toHaveBeenCalledTimes(1);
  });
});
