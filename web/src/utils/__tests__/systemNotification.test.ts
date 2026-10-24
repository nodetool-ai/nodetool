import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

import { useNotificationStore } from "../../stores/NotificationStore";
import { useSettingsStore } from "../../stores/SettingsStore";
import {
  canRequestSystemNotifications,
  notifySystem
} from "../systemNotification";

type ShowRequest = {
  title?: string;
  body: string;
  tag?: string;
  silent?: boolean;
};

const setFocused = (focused: boolean): void => {
  Object.defineProperty(document, "hidden", {
    value: false,
    configurable: true
  });
  jest.spyOn(document, "hasFocus").mockReturnValue(focused);
};

const installDesktopBridge = () => {
  const show = jest.fn(async (_request: ShowRequest) => true);
  (window as { api?: unknown }).api = { notifications: { show } };
  return show;
};

const installBrowserNotification = (permission: NotificationPermission) => {
  const ctor = jest.fn() as unknown as jest.Mock & {
    permission: NotificationPermission;
  };
  ctor.permission = permission;
  Object.defineProperty(globalThis, "Notification", {
    value: ctor,
    configurable: true,
    writable: true
  });
  return ctor;
};

describe("notifySystem", () => {
  beforeEach(() => {
    useSettingsStore.getState().setSystemNotifications(true);
    useSettingsStore.getState().setSoundNotifications(true);
    useNotificationStore.getState().clearNotifications();
  });

  afterEach(() => {
    delete (window as { api?: unknown }).api;
    delete (globalThis as { Notification?: unknown }).Notification;
    jest.restoreAllMocks();
  });

  it("stays silent while the app is focused", () => {
    const show = installDesktopBridge();
    setFocused(true);
    notifySystem({ body: "Workflow run finished." });
    expect(show).not.toHaveBeenCalled();
  });

  it("hands the notification to the desktop app while unfocused", () => {
    const show = installDesktopBridge();
    setFocused(false);
    notifySystem({ title: "Flow", body: "Workflow run finished.", tag: "run-1" });
    expect(show).toHaveBeenCalledWith({
      title: "Flow",
      body: "Workflow run finished.",
      tag: "run-1",
      silent: false
    });
  });

  it("follows the sound setting", () => {
    const show = installDesktopBridge();
    setFocused(false);
    useSettingsStore.getState().setSoundNotifications(false);
    notifySystem({ body: "Done" });
    expect(show).toHaveBeenCalledWith(
      expect.objectContaining({ title: "NodeTool", silent: true })
    );
  });

  it("respects the setting that turns desktop notifications off", () => {
    const show = installDesktopBridge();
    setFocused(false);
    useSettingsStore.getState().setSystemNotifications(false);
    notifySystem({ body: "Done" });
    expect(show).not.toHaveBeenCalled();
  });

  it("uses the browser API only after permission was granted", () => {
    setFocused(false);
    const denied = installBrowserNotification("default");
    notifySystem({ body: "Done" });
    expect(denied).not.toHaveBeenCalled();

    const granted = installBrowserNotification("granted");
    notifySystem({ body: "Done", tag: "t" });
    expect(granted).toHaveBeenCalledWith("NodeTool", { body: "Done", tag: "t" });
  });

  it("offers a permission prompt only in a browser that was not asked", () => {
    installBrowserNotification("default");
    expect(canRequestSystemNotifications()).toBe(true);
    installDesktopBridge();
    expect(canRequestSystemNotifications()).toBe(false);
  });
});

describe("addNotification with system", () => {
  afterEach(() => {
    delete (window as { api?: unknown }).api;
    jest.restoreAllMocks();
  });

  it("sends the toast content as a desktop notification", () => {
    const show = installDesktopBridge();
    setFocused(false);
    useSettingsStore.getState().setSystemNotifications(true);
    useNotificationStore.getState().addNotification({
      type: "error",
      content: "Job failed",
      dedupeKey: "job-1",
      system: { title: "Flow" }
    });
    expect(show).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Flow", body: "Job failed", tag: "job-1" })
    );
  });

  it("does not send a toast without the flag", () => {
    const show = installDesktopBridge();
    setFocused(false);
    useNotificationStore.getState().addNotification({
      type: "info",
      content: "Saved"
    });
    expect(show).not.toHaveBeenCalled();
  });
});
