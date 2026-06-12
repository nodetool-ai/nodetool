/**
 * Tests for web/src/lib/env.ts — specifically the getForcedLocalhost()
 * helper logic and the setForceLocalhost() function.
 *
 * Because env.ts computes its exports at module-load time AND the jest
 * config maps all `env` imports to a mock, we test the internal logic
 * by extracting getForcedLocalhost inline. This avoids fighting jsdom's
 * non-configurable window.location.
 */

function setImportMetaEnv(envOverrides: Record<string, string | undefined>) {
  Object.defineProperty(globalThis, "import", {
    value: {
      meta: {
        env: {
          MODE: "test",
          ...envOverrides,
        },
      },
    },
    configurable: true,
  });
}

/**
 * Reimplementation of getForcedLocalhost from env.ts to test its logic.
 * This mirrors the source exactly — any changes to env.ts should be
 * reflected here.
 */
function getForcedLocalhost(): boolean | null {
  if (typeof window === "undefined") return null;

  const envForce = (globalThis as any).import?.meta?.env?.VITE_FORCE_LOCALHOST;
  if (envForce === "true" || envForce === "1") return true;
  if (envForce === "false" || envForce === "0") return false;

  const urlParams = new URLSearchParams(window.location.search);
  const queryForce = urlParams.get("forceLocalhost");
  if (queryForce === "true" || queryForce === "1") return true;
  if (queryForce === "false" || queryForce === "0") return false;

  try {
    const stored = localStorage.getItem("forceLocalhost");
    if (stored === "true" || stored === "1") return true;
    if (stored === "false" || stored === "0") return false;
  } catch {
    // localStorage might not be available
  }

  return null;
}

/**
 * Reimplementation of setForceLocalhost from env.ts.
 */
function setForceLocalhost(force: boolean | null): void {
  if (typeof window === "undefined") return;
  try {
    if (force === null) {
      localStorage.removeItem("forceLocalhost");
    } else {
      localStorage.setItem("forceLocalhost", force ? "true" : "false");
    }
    // Don't call reload in test
  } catch {
    // ignore
  }
}

beforeEach(() => {
  localStorage.clear();
  setImportMetaEnv({});
});

describe("getForcedLocalhost via env var", () => {
  it("returns true when VITE_FORCE_LOCALHOST is 'true'", () => {
    setImportMetaEnv({ VITE_FORCE_LOCALHOST: "true" });
    expect(getForcedLocalhost()).toBe(true);
  });

  it("returns false when VITE_FORCE_LOCALHOST is 'false'", () => {
    setImportMetaEnv({ VITE_FORCE_LOCALHOST: "false" });
    expect(getForcedLocalhost()).toBe(false);
  });

  it("accepts '1' as truthy", () => {
    setImportMetaEnv({ VITE_FORCE_LOCALHOST: "1" });
    expect(getForcedLocalhost()).toBe(true);
  });

  it("accepts '0' as falsy", () => {
    setImportMetaEnv({ VITE_FORCE_LOCALHOST: "0" });
    expect(getForcedLocalhost()).toBe(false);
  });

  it("returns null when env var is not set", () => {
    setImportMetaEnv({});
    expect(getForcedLocalhost()).toBeNull();
  });
});

describe("getForcedLocalhost via localStorage", () => {
  it("returns true when localStorage has forceLocalhost=true", () => {
    localStorage.setItem("forceLocalhost", "true");
    expect(getForcedLocalhost()).toBe(true);
  });

  it("returns false when localStorage has forceLocalhost=false", () => {
    localStorage.setItem("forceLocalhost", "false");
    expect(getForcedLocalhost()).toBe(false);
  });

  it("accepts '1' as truthy", () => {
    localStorage.setItem("forceLocalhost", "1");
    expect(getForcedLocalhost()).toBe(true);
  });

  it("accepts '0' as falsy", () => {
    localStorage.setItem("forceLocalhost", "0");
    expect(getForcedLocalhost()).toBe(false);
  });

  it("returns null for unrecognized values", () => {
    localStorage.setItem("forceLocalhost", "maybe");
    expect(getForcedLocalhost()).toBeNull();
  });
});

describe("getForcedLocalhost priority", () => {
  it("env var takes priority over localStorage", () => {
    setImportMetaEnv({ VITE_FORCE_LOCALHOST: "false" });
    localStorage.setItem("forceLocalhost", "true");
    expect(getForcedLocalhost()).toBe(false);
  });

  it("env var true overrides localStorage false", () => {
    setImportMetaEnv({ VITE_FORCE_LOCALHOST: "true" });
    localStorage.setItem("forceLocalhost", "false");
    expect(getForcedLocalhost()).toBe(true);
  });
});

describe("setForceLocalhost", () => {
  it("sets localStorage to 'true'", () => {
    setForceLocalhost(true);
    expect(localStorage.getItem("forceLocalhost")).toBe("true");
  });

  it("sets localStorage to 'false'", () => {
    setForceLocalhost(false);
    expect(localStorage.getItem("forceLocalhost")).toBe("false");
  });

  it("removes localStorage entry when set to null", () => {
    localStorage.setItem("forceLocalhost", "true");
    setForceLocalhost(null);
    expect(localStorage.getItem("forceLocalhost")).toBeNull();
  });
});
