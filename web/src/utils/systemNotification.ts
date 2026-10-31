/**
 * Desktop notifications for events the user would miss while NodeTool is in
 * the background: a finished run, a chat reply, a landed generation.
 *
 * Nothing is shown while the app has focus, since the in-app toast and the
 * panels already show the result. The desktop app hands the notification to
 * the main process, which shows a native one and focuses the window on
 * click. In a browser the Notification API is used once the user granted it.
 */

import { useSettingsStore } from "../stores/SettingsStore";

export interface SystemNotificationOptions {
  /** Defaults to "NodeTool". */
  title?: string;
  body: string;
  /** A later notification with the same tag replaces this one. */
  tag?: string;
}

const DEFAULT_TITLE = "NodeTool";

const browserNotifications = (): typeof Notification | undefined =>
  typeof Notification === "undefined" ? undefined : Notification;

/** Whether NodeTool is the window the user is looking at. */
export function isAppFocused(): boolean {
  if (typeof document === "undefined") {
    return true;
  }
  return !document.hidden && document.hasFocus();
}

/** Show a desktop notification unless the app is focused or the user turned them off. */
export function notifySystem(options: SystemNotificationOptions): void {
  const body = options.body.trim();
  if (!body || isAppFocused()) {
    return;
  }
  const { systemNotifications, soundNotifications } =
    useSettingsStore.getState().settings;
  if (systemNotifications === false) {
    return;
  }
  const title = options.title?.trim() || DEFAULT_TITLE;

  const desktop = typeof window === "undefined" ? undefined : window.api;
  if (desktop?.notifications) {
    desktop.notifications
      .show({ title, body, tag: options.tag, silent: !soundNotifications })
      .catch((error: unknown) => {
        console.warn("System notification failed", error);
      });
    return;
  }

  const api = browserNotifications();
  if (api?.permission !== "granted") {
    return;
  }
  try {
    const notification = new api(title, { body, tag: options.tag });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch {
    // Some browsers only allow notifications from a service worker. The
    // toast is still there when the user comes back.
  }
}

/**
 * Whether the browser could show notifications once the user allows them.
 * The desktop app needs no permission prompt.
 */
export function canRequestSystemNotifications(): boolean {
  if (typeof window !== "undefined" && window.api?.notifications) {
    return false;
  }
  return browserNotifications()?.permission === "default";
}

/** Ask the browser for notification permission. */
export async function requestSystemNotifications(): Promise<void> {
  await browserNotifications()?.requestPermission();
}
