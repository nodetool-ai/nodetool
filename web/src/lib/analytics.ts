import { isElectron } from "./env";

// Domain registered in the Plausible dashboard. The hosted production website
// runs here; events are only accepted for a registered site, so this doubles as
// the guard that keeps tracking on production and off everywhere else.
const PLAUSIBLE_DOMAIN = "app.nodetool.ai";
const PLAUSIBLE_SCRIPT = "https://plausible.io/js/script.js";

/**
 * Load Plausible analytics on the production website only.
 *
 * Runs solely when served from PLAUSIBLE_DOMAIN — never on localhost/dev,
 * preview hosts, or the Electron desktop app. We only want to understand how
 * people use the hosted web app online. Privacy-friendly, cookieless, no PII.
 */
export const initAnalytics = (): void => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }
  if (isElectron || window.location.hostname !== PLAUSIBLE_DOMAIN) {
    return;
  }
  if (document.querySelector(`script[data-domain="${PLAUSIBLE_DOMAIN}"]`)) {
    return;
  }

  const script = document.createElement("script");
  script.defer = true;
  script.src = PLAUSIBLE_SCRIPT;
  script.dataset.domain = PLAUSIBLE_DOMAIN;
  document.head.appendChild(script);

  // Queue events fired before the script loads (Plausible's standard shim).
  window.plausible =
    window.plausible ||
    function (...args: unknown[]) {
      (window.plausible!.q = window.plausible!.q || []).push(args);
    };
};
