import {
  DEV_MODE_ENV_KEY,
  WEB_DEV_SERVER_ENV_KEY,
  DEFAULT_WEB_DEV_SERVER_URL,
  isElectronDevMode,
  getWebDevServerUrl
} from "../devMode";

describe("devMode", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("constants", () => {
    it("exports the expected env key names", () => {
      expect(DEV_MODE_ENV_KEY).toBe("NT_ELECTRON_DEV_MODE");
      expect(WEB_DEV_SERVER_ENV_KEY).toBe("NT_WEB_DEV_SERVER_URL");
    });

    it("exports a default dev server URL", () => {
      expect(DEFAULT_WEB_DEV_SERVER_URL).toBe("http://127.0.0.1:3000");
    });
  });

  describe("isElectronDevMode", () => {
    it('returns true when env var is "1"', () => {
      process.env[DEV_MODE_ENV_KEY] = "1";
      expect(isElectronDevMode()).toBe(true);
    });

    it("returns false when env var is not set", () => {
      delete process.env[DEV_MODE_ENV_KEY];
      expect(isElectronDevMode()).toBe(false);
    });

    it("returns false when env var is a different value", () => {
      process.env[DEV_MODE_ENV_KEY] = "true";
      expect(isElectronDevMode()).toBe(false);
    });

    it('returns false when env var is "0"', () => {
      process.env[DEV_MODE_ENV_KEY] = "0";
      expect(isElectronDevMode()).toBe(false);
    });
  });

  describe("getWebDevServerUrl", () => {
    it("returns default URL when env var is not set", () => {
      delete process.env[WEB_DEV_SERVER_ENV_KEY];
      expect(getWebDevServerUrl()).toBe(DEFAULT_WEB_DEV_SERVER_URL);
    });

    it("returns default URL when env var is empty", () => {
      process.env[WEB_DEV_SERVER_ENV_KEY] = "";
      expect(getWebDevServerUrl()).toBe(DEFAULT_WEB_DEV_SERVER_URL);
    });

    it("returns default URL when env var is whitespace only", () => {
      process.env[WEB_DEV_SERVER_ENV_KEY] = "   ";
      expect(getWebDevServerUrl()).toBe(DEFAULT_WEB_DEV_SERVER_URL);
    });

    it("returns the configured URL", () => {
      process.env[WEB_DEV_SERVER_ENV_KEY] = "http://localhost:5173";
      expect(getWebDevServerUrl()).toBe("http://localhost:5173");
    });

    it("trims whitespace from configured URL", () => {
      process.env[WEB_DEV_SERVER_ENV_KEY] = "  http://localhost:5173  ";
      expect(getWebDevServerUrl()).toBe("http://localhost:5173");
    });

    it("strips trailing slashes", () => {
      process.env[WEB_DEV_SERVER_ENV_KEY] = "http://localhost:5173///";
      expect(getWebDevServerUrl()).toBe("http://localhost:5173");
    });
  });
});
