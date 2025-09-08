import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import * as Sentry from "@sentry/react";
import { initSentry } from "../sentry";

// Mock Sentry
jest.mock("@sentry/react", () => ({
  init: jest.fn(),
  browserTracingIntegration: jest.fn(() => "browserTracingIntegration"),
  replayIntegration: jest.fn(() => "replayIntegration")
}));

// Mock import.meta.env
const originalEnv = (global as any).import?.meta?.env;

describe("sentry", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset import.meta.env
    (global as any).import = {
      meta: {
        env: {
          MODE: "development",
          VITE_SENTRY_DSN: "https://test@sentry.io/123456"
        }
      }
    };
  });

  afterEach(() => {
    if (originalEnv) {
      (global as any).import = { meta: { env: originalEnv } };
    }
  });

  describe("initSentry", () => {
    it("should not initialize Sentry in development mode", () => {
      (global as any).import.meta.env.MODE = "development";
      
      initSentry();
      
      expect(Sentry.init).not.toHaveBeenCalled();
    });

    it("should not initialize Sentry in test mode", () => {
      (global as any).import.meta.env.MODE = "test";
      
      initSentry();
      
      expect(Sentry.init).not.toHaveBeenCalled();
    });

    it("should initialize Sentry in production mode", () => {
      (global as any).import.meta.env.MODE = "production";
      (global as any).import.meta.env.VITE_SENTRY_DSN = "https://test@sentry.io/123456";
      
      initSentry();
      
      expect(Sentry.init).toHaveBeenCalledWith({
        dsn: "https://test@sentry.io/123456",
        integrations: [
          "browserTracingIntegration",
          "replayIntegration"
        ],
        tracesSampleRate: 1.0,
        tracePropagationTargets: [/^https:\/\/app.nodetool\.ai/],
        replaysSessionSampleRate: 0.1,
        replaysOnErrorSampleRate: 1.0
      });
    });

    it("should call integration functions", () => {
      (global as any).import.meta.env.MODE = "production";
      
      initSentry();
      
      expect(Sentry.browserTracingIntegration).toHaveBeenCalled();
      expect(Sentry.replayIntegration).toHaveBeenCalled();
    });

    it("should use correct configuration values", () => {
      (global as any).import.meta.env.MODE = "production";
      const customDsn = "https://custom@sentry.io/999999";
      (global as any).import.meta.env.VITE_SENTRY_DSN = customDsn;
      
      initSentry();
      
      const initCall = (Sentry.init as jest.Mock).mock.calls[0][0];
      expect(initCall.dsn).toBe(customDsn);
      expect(initCall.tracesSampleRate).toBe(1.0);
      expect(initCall.replaysSessionSampleRate).toBe(0.1);
      expect(initCall.replaysOnErrorSampleRate).toBe(1.0);
    });

    it("should handle missing DSN in production", () => {
      (global as any).import.meta.env.MODE = "production";
      (global as any).import.meta.env.VITE_SENTRY_DSN = undefined;
      
      initSentry();
      
      const initCall = (Sentry.init as jest.Mock).mock.calls[0][0];
      expect(initCall.dsn).toBeUndefined();
    });

    it("should handle empty DSN in production", () => {
      (global as any).import.meta.env.MODE = "production";
      (global as any).import.meta.env.VITE_SENTRY_DSN = "";
      
      initSentry();
      
      const initCall = (Sentry.init as jest.Mock).mock.calls[0][0];
      expect(initCall.dsn).toBe("");
    });
  });
});