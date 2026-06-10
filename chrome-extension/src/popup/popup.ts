/**
 * Popup controller.
 *
 * Renders the relay connection status, lets the user edit the server URL, and
 * exposes the explicit "Attach to this tab" gesture. All actual work happens in
 * the service worker; the popup only sends runtime messages and renders the
 * returned {@link RelayStatus}.
 */

import {
  DEFAULT_SERVER_URL,
  type RelayConnectionState,
  type RelayStatus,
} from "../lib/cdp-relay.js";

interface PopupResponse {
  ok: boolean;
  status?: RelayStatus;
  error?: string;
}

const dom = {
  statusDot: requireEl<HTMLSpanElement>("status-dot"),
  statusLabel: requireEl<HTMLSpanElement>("status-label"),
  serverUrl: requireEl<HTMLInputElement>("server-url"),
  saveUrl: requireEl<HTMLButtonElement>("save-url"),
  attachInfo: requireEl<HTMLParagraphElement>("attach-info"),
  attachBtn: requireEl<HTMLButtonElement>("attach-btn"),
  detachBtn: requireEl<HTMLButtonElement>("detach-btn"),
  error: requireEl<HTMLParagraphElement>("error"),
};

const CONNECTION_LABELS: Record<RelayConnectionState, string> = {
  disconnected: "Disconnected",
  connecting: "Connecting…",
  connected: "Connected",
  error: "Connection error",
};

function requireEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`Missing popup element: #${id}`);
  }
  return el as T;
}

async function sendRequest(message: unknown): Promise<PopupResponse> {
  const response = (await chrome.runtime.sendMessage(message)) as
    | PopupResponse
    | undefined;
  if (!response) {
    throw new Error("No response from service worker.");
  }
  return response;
}

function render(status: RelayStatus): void {
  dom.statusDot.dataset.state = status.connection;
  dom.statusLabel.textContent = CONNECTION_LABELS[status.connection];

  if (document.activeElement !== dom.serverUrl) {
    dom.serverUrl.value = status.serverUrl || DEFAULT_SERVER_URL;
  }

  const attached = status.attachedTabId !== null;
  dom.attachInfo.dataset.attached = String(attached);
  dom.attachInfo.textContent = attached
    ? `Attached to tab ${status.attachedTabId}.`
    : "No tab attached.";
  dom.attachBtn.hidden = attached;
  dom.detachBtn.hidden = !attached;

  if (status.lastError) {
    dom.error.hidden = false;
    dom.error.textContent = status.lastError;
  } else {
    dom.error.hidden = true;
    dom.error.textContent = "";
  }
}

function showError(message: string): void {
  dom.error.hidden = false;
  dom.error.textContent = message;
}

async function refreshStatus(): Promise<void> {
  try {
    const response = await sendRequest({ type: "get-status" });
    if (response.status) {
      render(response.status);
    }
  } catch (err) {
    showError(err instanceof Error ? err.message : String(err));
  }
}

function applyResponse(response: PopupResponse): void {
  if (!response.ok) {
    showError(response.error ?? "Request failed.");
    return;
  }
  if (response.status) {
    render(response.status);
  }
}

dom.saveUrl.addEventListener("click", () => {
  void (async () => {
    try {
      applyResponse(
        await sendRequest({
          type: "set-server-url",
          url: dom.serverUrl.value,
        }),
      );
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err));
    }
  })();
});

dom.attachBtn.addEventListener("click", () => {
  void (async () => {
    dom.attachBtn.disabled = true;
    try {
      applyResponse(await sendRequest({ type: "attach" }));
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err));
    } finally {
      dom.attachBtn.disabled = false;
    }
  })();
});

dom.detachBtn.addEventListener("click", () => {
  void (async () => {
    dom.detachBtn.disabled = true;
    try {
      applyResponse(await sendRequest({ type: "detach" }));
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err));
    } finally {
      dom.detachBtn.disabled = false;
    }
  })();
});

// Keep the popup live with the worker while it is open.
const pollHandle = setInterval(() => void refreshStatus(), 1_500);
window.addEventListener("unload", () => clearInterval(pollHandle));

void refreshStatus();
