// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import "@testing-library/jest-dom";

// Mock React to prevent createContext issues in test environment
jest.mock("react", () => ({
  ...jest.requireActual("react"),
  createContext: jest.fn(() => ({ Provider: ({ children }: any) => children })),
  useCallback: (fn: any) => fn,
  useMemo: (fn: any) => fn(),
  useState: (initial: any) => [initial, jest.fn()],
  useEffect: jest.fn(),
  useRef: (initial: any) => ({ current: initial }),
}));

// Mock import.meta for Vite environment variables
Object.defineProperty(globalThis, "import", {
  value: {
    meta: {
      env: {
        MODE: "test",
        VITE_API_URL: "http://localhost:8000",
        VITE_SUPABASE_URL: "https://test.supabase.co",
        VITE_SUPABASE_ANON_KEY: "test-anon-key",
        VITE_SENTRY_DSN: "https://test@sentry.io/123456"
      }
    }
  }
});

// Mock TextEncoder/TextDecoder for msgpack
import { TextEncoder, TextDecoder } from "util";
(global as any).TextEncoder = TextEncoder;
(global as any).TextDecoder = TextDecoder;

// Mock global.btoa and atob for base64 operations
global.btoa = (str: string) => Buffer.from(str, "binary").toString("base64");
global.atob = (str: string) => Buffer.from(str, "base64").toString("binary");

