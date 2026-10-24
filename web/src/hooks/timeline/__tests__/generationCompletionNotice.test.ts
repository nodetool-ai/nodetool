import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

import { useNotificationStore } from "../../../stores/NotificationStore";
import {
  COMPLETION_BURST_MS,
  __resetGenerationCompletionNoticeForTests,
  announceGenerationFinished
} from "../generationCompletionNotice";

type NotificationCtor = jest.Mock & {
  permission: NotificationPermission;
  requestPermission: jest.Mock;
};

const installNotification = (
  permission: NotificationPermission
): NotificationCtor => {
  const ctor = jest.fn() as unknown as NotificationCtor;
  ctor.permission = permission;
  ctor.requestPermission = jest.fn(async () => "granted");
  Object.defineProperty(globalThis, "Notification", {
    value: ctor,
    configurable: true,
    writable: true
  });
  return ctor;
};

const setHidden = (hidden: boolean): void => {
  Object.defineProperty(document, "hidden", {
    value: hidden,
    configurable: true
  });
  jest.spyOn(document, "hasFocus").mockReturnValue(!hidden);
};

const toasts = () =>
  useNotificationStore
    .getState()
    .notifications.filter((n) => n.type === "success");

const finish = (requestId: string, now: number, clipName = "Intro") =>
  announceGenerationFinished(
    { requestId, sequenceId: "seq-1", clipName, kind: "generation" },
    now
  );

describe("announceGenerationFinished", () => {
  beforeEach(() => {
    __resetGenerationCompletionNoticeForTests();
    useNotificationStore.getState().clearNotifications();
    setHidden(false);
  });
  afterEach(() => {
    delete (globalThis as { Notification?: unknown }).Notification;
    jest.restoreAllMocks();
  });

  it("shows one success toast naming the clip", () => {
    installNotification("denied");
    finish("req-1", 1_000);
    expect(toasts()).toHaveLength(1);
    expect(toasts()[0].content).toBe('"Intro" finished generating.');
    expect(toasts()[0].action).toBeUndefined();
  });

  it("announces a request once", () => {
    installNotification("denied");
    finish("req-1", 1_000);
    useNotificationStore.getState().clearNotifications();
    finish("req-1", 2_000);
    expect(toasts()).toHaveLength(0);
  });

  it("counts a burst of landings in one toast", () => {
    installNotification("denied");
    finish("req-1", 1_000);
    finish("req-2", 2_000);
    finish("req-3", 3_000);
    expect(toasts()).toHaveLength(1);
    expect(toasts()[0].content).toBe("3 clips finished generating.");

    finish("req-4", 3_000 + COMPLETION_BURST_MS + 1);
    expect(toasts()[0].content).toBe('"Intro" finished generating.');
  });

  it("names an edit", () => {
    installNotification("denied");
    announceGenerationFinished({
      requestId: "edit-1",
      sequenceId: "seq-1",
      clipName: "Beach",
      kind: "edit"
    });
    expect(toasts()[0].content).toBe('The edit of "Beach" finished.');
  });

  it("sends a system notification only while the app is in the background", () => {
    const ctor = installNotification("granted");
    finish("req-1", 1_000);
    expect(ctor).not.toHaveBeenCalled();

    setHidden(true);
    finish("req-2", 1_000 + COMPLETION_BURST_MS + 1);
    expect(ctor).toHaveBeenCalledWith("NodeTool", {
      body: '"Intro" finished generating.',
      tag: "timeline-generation-finished-seq-1"
    });
  });

  it("offers to turn on desktop alerts before the browser was asked", async () => {
    const ctor = installNotification("default");
    setHidden(true);
    finish("req-1", 1_000);
    expect(ctor).not.toHaveBeenCalled();
    const action = toasts()[0].action;
    expect(action?.label).toBe("Turn on desktop alerts");
    await action?.onClick();
    expect(ctor.requestPermission).toHaveBeenCalled();
  });
});
