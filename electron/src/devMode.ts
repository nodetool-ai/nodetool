const DEV_MODE_ENV_KEY = "NT_ELECTRON_DEV_MODE";
const WEB_DEV_SERVER_ENV_KEY = "NT_WEB_DEV_SERVER_URL";
const DEFAULT_WEB_DEV_SERVER_URL = "http://127.0.0.1:3000";

function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function isElectronDevMode(): boolean {
  return process.env[DEV_MODE_ENV_KEY] === "1";
}

function getWebDevServerUrl(): string {
  const configuredUrl = process.env[WEB_DEV_SERVER_ENV_KEY];
  if (!configuredUrl || configuredUrl.trim().length === 0) {
    return DEFAULT_WEB_DEV_SERVER_URL;
  }
  return normalizeUrl(configuredUrl.trim());
}

export {
  DEV_MODE_ENV_KEY,
  WEB_DEV_SERVER_ENV_KEY,
  DEFAULT_WEB_DEV_SERVER_URL,
  isElectronDevMode,
  getWebDevServerUrl,
};
