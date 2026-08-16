import Constants from 'expo-constants';
import * as Sentry from '@sentry/react-native';
import { installSentryReporter, __resetSentryReporterForTests } from './sentryReporter';
import {
  reportError,
  setErrorReporter,
  __resetErrorReportingForTests,
} from './errorReporting';

type MutableExtra = { sentryDsn?: string };

const extra = Constants.expoConfig?.extra as MutableExtra;

const DSN = 'https://publickey@o0.ingest.sentry.io/1';

describe('sentryReporter', () => {
  afterEach(() => {
    delete extra.sentryDsn;
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    __resetSentryReporterForTests();
    __resetErrorReportingForTests();
    jest.clearAllMocks();
  });

  describe('without a DSN', () => {
    it('does not initialize Sentry', () => {
      installSentryReporter();

      expect(Sentry.init).not.toHaveBeenCalled();
    });

    it('leaves the active reporter untouched', () => {
      const existing = jest.fn();
      setErrorReporter({ captureException: existing });

      installSentryReporter();

      const err = new Error('boom');
      reportError(err, { source: 'test' });

      expect(existing).toHaveBeenCalledWith(err, { source: 'test' });
      expect(Sentry.captureException).not.toHaveBeenCalled();
    });
  });

  describe('with a DSN', () => {
    it('initializes Sentry with crash-only, PII-free options', () => {
      extra.sentryDsn = DSN;

      installSentryReporter();

      expect(Sentry.init).toHaveBeenCalledTimes(1);
      const options = jest.mocked(Sentry.init).mock.calls[0][0];
      expect(options).toMatchObject({
        dsn: DSN,
        sendDefaultPii: false,
        tracesSampleRate: 0,
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 0,
        release: 'nodetool-mobile@1.0.0',
        dist: '1.0.0',
      });
    });

    it('reads the DSN from the env var as a fallback', () => {
      process.env.EXPO_PUBLIC_SENTRY_DSN = DSN;

      installSentryReporter();

      expect(Sentry.init).toHaveBeenCalledTimes(1);
      expect(jest.mocked(Sentry.init).mock.calls[0][0].dsn).toBe(DSN);
    });

    it('installs itself once', () => {
      extra.sentryDsn = DSN;

      installSentryReporter();
      installSentryReporter();

      expect(Sentry.init).toHaveBeenCalledTimes(1);
    });

    it('maps source, fatal and extra onto the Sentry scope', () => {
      extra.sentryDsn = DSN;
      installSentryReporter();

      const err = new Error('boom');
      reportError(err, { source: 'ErrorBoundary', fatal: true, extra: { nodeId: 'n1' } });

      expect(Sentry.captureException).toHaveBeenCalledWith(err, {
        level: 'fatal',
        tags: { source: 'ErrorBoundary', fatal: 'true' },
        contexts: { nodetool: { nodeId: 'n1' } },
      });
    });

    it('defaults source and fatal when no context is given', () => {
      extra.sentryDsn = DSN;
      installSentryReporter();

      const err = new Error('bare');
      reportError(err);

      expect(Sentry.captureException).toHaveBeenCalledWith(err, {
        level: 'error',
        tags: { source: 'unknown', fatal: 'false' },
        contexts: {},
      });
    });

    it('does not throw when Sentry.captureException throws', () => {
      extra.sentryDsn = DSN;
      installSentryReporter();
      jest.mocked(Sentry.captureException).mockImplementationOnce(() => {
        throw new Error('sdk broke');
      });

      expect(() => reportError(new Error('x'))).not.toThrow();
    });

    it('does not install the reporter when Sentry.init throws', () => {
      extra.sentryDsn = DSN;
      const existing = jest.fn();
      setErrorReporter({ captureException: existing });
      jest.mocked(Sentry.init).mockImplementationOnce(() => {
        throw new Error('init broke');
      });

      expect(() => installSentryReporter()).not.toThrow();

      const err = new Error('after');
      reportError(err);
      expect(existing).toHaveBeenCalledWith(err, undefined);
      expect(Sentry.captureException).not.toHaveBeenCalled();
    });
  });
});
