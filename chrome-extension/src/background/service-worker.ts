/**
 * MV3 service worker entry point.
 *
 * Owns the single {@link CdpRelay} instance and routes:
 *   - keepalive alarms (to keep the worker alive so `chrome.debugger` stays
 *     attached),
 *   - runtime messages from the popup (status, set-url, attach, detach).
 *
 * The worker holds no chat or UI logic — it is purely the CDP conduit.
 */

import {
  CdpRelay,
  KEEPALIVE_ALARM_NAME,
  type RelayStatus,
} from "../lib/cdp-relay.js";

/** Messages the popup sends to the service worker. */
type PopupRequest =
  | { type: "get-status" }
  | { type: "set-server-url"; url: string }
  | { type: "attach" }
  | { type: "detach" };

/** Responses the service worker returns to the popup. */
interface PopupResponse {
  ok: boolean;
  status?: RelayStatus;
  error?: string;
}

const relay = new CdpRelay();

void relay.start();

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEPALIVE_ALARM_NAME) {
    relay.handleKeepalive();
  }
});

chrome.runtime.onMessage.addListener(
  (message: unknown, _sender, sendResponse): boolean => {
    if (!isPopupRequest(message)) {
      sendResponse({ ok: false, error: "Unknown message." } satisfies PopupResponse);
      return false;
    }
    handlePopupRequest(message)
      .then((response) => sendResponse(response))
      .catch((err: unknown) =>
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        } satisfies PopupResponse),
      );
    // Returning true keeps the message channel open for the async response.
    return true;
  },
);

async function handlePopupRequest(
  request: PopupRequest,
): Promise<PopupResponse> {
  switch (request.type) {
    case "get-status":
      return { ok: true, status: relay.getStatus() };
    case "set-server-url":
      await relay.setServerUrl(request.url);
      return { ok: true, status: relay.getStatus() };
    case "attach":
      await relay.attachActiveTab();
      return { ok: true, status: relay.getStatus() };
    case "detach":
      await relay.detach();
      return { ok: true, status: relay.getStatus() };
    default:
      return { ok: false, error: "Unhandled request type." };
  }
}

function isPopupRequest(value: unknown): value is PopupRequest {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const type = (value as { type?: unknown }).type;
  return (
    type === "get-status" ||
    type === "set-server-url" ||
    type === "attach" ||
    type === "detach"
  );
}
