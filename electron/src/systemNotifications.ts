/**
 * Native OS notifications for renderer events the user would otherwise miss.
 *
 * The renderer asks for one when something it treats as important finishes
 * (a workflow run, a chat turn). A notification is only shown while no app
 * window has focus: the in-app toast already covers the focused case.
 * Clicking it brings back the window that asked.
 */

import { BrowserWindow, Notification } from "electron";

import { logMessage } from "./logger";
import { isString } from "./typePredicates";
import type { SystemNotificationRequest } from "./types.d";

const MAX_TITLE_LENGTH = 120;
const MAX_BODY_LENGTH = 400;
const MAX_TAG_LENGTH = 200;
/** Notifications kept for click handling. Older ones stop focusing the app. */
const MAX_TRACKED = 50;

/**
 * Shown notifications by tag. A tagged notification replaces the earlier one
 * with the same tag. Holding the reference also keeps the click handler alive:
 * a collected Notification drops its events.
 */
const shown = new Map<string, Notification>();
let untaggedCount = 0;

const clip = (value: unknown, max: number): string => {
  if (!isString(value)) {
    return "";
  }
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
};

/** Whether any NodeTool window has keyboard focus. */
export function isAnyAppWindowFocused(): boolean {
  return BrowserWindow.getAllWindows().some(
    (window) => !window.isDestroyed() && window.isFocused(),
  );
}

function focusWindow(window: BrowserWindow | null): void {
  if (!window || window.isDestroyed()) {
    return;
  }
  if (window.isMinimized()) {
    window.restore();
  }
  window.show();
  window.focus();
}

/**
 * Show a native notification unless an app window is focused.
 *
 * @param request Title, body and optional replacement tag from the renderer.
 * @param source The window that asked, focused when the user clicks.
 * @returns Whether a notification was shown.
 */
export function showSystemNotification(
  request: SystemNotificationRequest,
  source: BrowserWindow | null,
): boolean {
  const body = clip(request?.body, MAX_BODY_LENGTH);
  if (!body) {
    return false;
  }
  if (isAnyAppWindowFocused() || !Notification.isSupported()) {
    return false;
  }

  const title = clip(request.title, MAX_TITLE_LENGTH) || "NodeTool";
  const tag =
    clip(request.tag, MAX_TAG_LENGTH) || `untagged-${++untaggedCount}`;

  shown.get(tag)?.close();

  const notification = new Notification({
    title,
    body,
    silent: request.silent === true,
  });
  shown.set(tag, notification);
  if (shown.size > MAX_TRACKED) {
    const oldest = shown.keys().next().value;
    if (oldest !== undefined) {
      shown.delete(oldest);
    }
  }
  const forget = () => {
    if (shown.get(tag) === notification) {
      shown.delete(tag);
    }
  };
  notification.on("click", () => {
    forget();
    focusWindow(source);
  });
  notification.on("close", forget);
  notification.show();
  logMessage(`System notification shown: ${title}`);
  return true;
}
