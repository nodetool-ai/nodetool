import { isElectron as browserIsElectron } from "../utils/browser";

export const isLocalhost: boolean =
  typeof window !== "undefined" &&
  (window.location.hostname.includes("dev.") ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "localhost");

export const isProduction = !isLocalhost;
export const isElectron = browserIsElectron;

if (typeof window !== "undefined") {
  window.isProduction = isProduction;
  window.isLocalhost = isLocalhost;
  window.isElectron = isElectron;
}
