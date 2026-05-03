/**
 * @jest-environment jsdom
 */
import { getAuthRedirectUrl } from "../useAuth";

describe("getAuthRedirectUrl", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.VITE_AUTH_REDIRECT_URL;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("uses VITE_AUTH_REDIRECT_URL when set", () => {
    process.env.VITE_AUTH_REDIRECT_URL = "https://example.com/callback";
    expect(getAuthRedirectUrl()).toBe("https://example.com/callback");
  });

  it("falls back to window.location.origin in jsdom", () => {
    const result = getAuthRedirectUrl();
    expect(result).toBe("http://localhost/");
  });

  it("does not use empty VITE_AUTH_REDIRECT_URL", () => {
    process.env.VITE_AUTH_REDIRECT_URL = "";
    const result = getAuthRedirectUrl();
    expect(result).toBe("http://localhost/");
  });
});
