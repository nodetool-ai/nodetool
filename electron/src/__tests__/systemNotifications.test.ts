import { BrowserWindow, Notification } from "electron";

type Handler = () => void;

interface FakeNotification {
  options: { title: string; body: string };
  handlers: Record<string, Handler>;
  show: jest.Mock;
  close: jest.Mock;
}

const created: FakeNotification[] = [];

jest.mock("electron", () => {
  const NotificationMock = jest.fn().mockImplementation((options) => {
    const fake: FakeNotification = {
      options,
      handlers: {},
      show: jest.fn(),
      close: jest.fn(),
    };
    created.push(fake);
    return {
      on: (event: string, handler: Handler) => {
        fake.handlers[event] = handler;
      },
      show: fake.show,
      close: fake.close,
    };
  });
  Object.assign(NotificationMock, { isSupported: jest.fn(() => true) });
  return {
    BrowserWindow: { getAllWindows: jest.fn(() => []) },
    Notification: NotificationMock,
  };
});

jest.mock("../logger", () => ({ logMessage: jest.fn() }));

import { showSystemNotification } from "../systemNotifications";

const fakeWindow = (focused: boolean, minimized = false) => ({
  isDestroyed: jest.fn(() => false),
  isFocused: jest.fn(() => focused),
  isMinimized: jest.fn(() => minimized),
  restore: jest.fn(),
  show: jest.fn(),
  focus: jest.fn(),
});

type FakeWindow = ReturnType<typeof fakeWindow>;

const setWindows = (windows: FakeWindow[]) => {
  jest
    .mocked(BrowserWindow.getAllWindows)
    .mockReturnValue(windows as unknown as BrowserWindow[]);
};

const asWindow = (window: FakeWindow) => window as unknown as BrowserWindow;

describe("showSystemNotification", () => {
  beforeEach(() => {
    created.length = 0;
    jest.mocked(Notification.isSupported).mockReturnValue(true);
  });

  it("stays silent while an app window is focused", () => {
    const window = fakeWindow(true);
    setWindows([window]);
    expect(
      showSystemNotification({ body: "Run finished" }, asWindow(window)),
    ).toBe(false);
    expect(created).toHaveLength(0);
  });

  it("shows a notification when no window is focused", () => {
    const window = fakeWindow(false);
    setWindows([window, fakeWindow(false)]);
    expect(
      showSystemNotification(
        { title: "Chat", body: "Reply ready" },
        asWindow(window),
      ),
    ).toBe(true);
    expect(created).toHaveLength(1);
    expect(created[0].options).toMatchObject({
      title: "Chat",
      body: "Reply ready",
    });
    expect(created[0].show).toHaveBeenCalled();
  });

  it("defaults the title and skips an empty body", () => {
    setWindows([]);
    expect(showSystemNotification({ body: "   " }, null)).toBe(false);
    expect(showSystemNotification({ body: "Done" }, null)).toBe(true);
    expect(created[0].options.title).toBe("NodeTool");
  });

  it("does nothing when the platform has no notifications", () => {
    setWindows([]);
    jest.mocked(Notification.isSupported).mockReturnValue(false);
    expect(showSystemNotification({ body: "Done" }, null)).toBe(false);
    expect(created).toHaveLength(0);
  });

  it("clips a long body", () => {
    setWindows([]);
    showSystemNotification({ body: "x".repeat(1000) }, null);
    expect(created[0].options.body.length).toBe(400);
    expect(created[0].options.body.endsWith("…")).toBe(true);
  });

  it("replaces an earlier notification with the same tag", () => {
    setWindows([]);
    showSystemNotification({ body: "1 clip finished", tag: "burst" }, null);
    showSystemNotification({ body: "2 clips finished", tag: "burst" }, null);
    showSystemNotification({ body: "Other" }, null);
    expect(created).toHaveLength(3);
    expect(created[0].close).toHaveBeenCalled();
    expect(created[1].close).not.toHaveBeenCalled();
  });

  it("restores and focuses the asking window on click", () => {
    const window = fakeWindow(false, true);
    setWindows([window]);
    showSystemNotification({ body: "Run finished" }, asWindow(window));
    created[0].handlers.click();
    expect(window.restore).toHaveBeenCalled();
    expect(window.show).toHaveBeenCalled();
    expect(window.focus).toHaveBeenCalled();
  });
});
