import log from "loglevel";
import { isElectron as browserIsElectron } from "../utils/browser";

const getForcedLocalhost = (): boolean | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const envForce = import.meta.env.VITE_FORCE_LOCALHOST;
  if (envForce === "true" || envForce === "1") {
    return true;
  }
  if (envForce === "false" || envForce === "0") {
    return false;
  }

  const urlParams = new URLSearchParams(window.location.search);
  const queryForce = urlParams.get("forceLocalhost");
  if (queryForce === "true" || queryForce === "1") {
    return true;
  }
  if (queryForce === "false" || queryForce === "0") {
    return false;
  }

  try {
    const stored = localStorage.getItem("forceLocalhost");
    if (stored === "true" || stored === "1") {
      return true;
    }
    if (stored === "false" || stored === "0") {
      return false;
    }
  } catch {
    // localStorage might not be available.
  }

  return null;
};

export const isLocalhost = (() => {
  const forced = getForcedLocalhost();
  if (forced !== null) {
    return forced;
  }

  return (
    typeof window !== "undefined" &&
    (window.location.hostname.includes("dev.") ||
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname === "localhost")
  );
})();

export const isDevelopment = isLocalhost;
export const isProduction = !isLocalhost;
export const isElectron = browserIsElectron;

export const setForceLocalhost = (force: boolean | null): void => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (force === null) {
      localStorage.removeItem("forceLocalhost");
    } else {
      localStorage.setItem("forceLocalhost", force ? "true" : "false");
    }
    window.location.reload();
  } catch (error) {
    log.warn("Failed to set forceLocalhost preference:", error);
  }
};

if (typeof window !== "undefined") {
  window.isProduction = isProduction;
  window.isLocalhost = isLocalhost;
  window.isElectron = isElectron;
  window.setForceLocalhost = setForceLocalhost;
}
