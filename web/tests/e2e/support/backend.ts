const DEFAULT_BACKEND_URL = "http://localhost:7777";

const normalizeUrl = (url: string) => url.replace(/\/$/, "");

export const BACKEND_URL = normalizeUrl(
  process.env.E2E_BACKEND_URL || DEFAULT_BACKEND_URL
);

export const BACKEND_API_URL = `${BACKEND_URL}/api`;

export const BACKEND_WS_URL = normalizeUrl(
  process.env.E2E_BACKEND_WS_URL || BACKEND_URL.replace(/^http/, "ws")
);

export const BACKEND_HOST = (() => {
  try {
    return new URL(BACKEND_URL).host;
  } catch {
    return "localhost:7777";
  }
})();
