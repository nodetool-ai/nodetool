/**
 * The open-project signal: the client tells the server which project it has
 * open, so the server watches that project's folder and stops when no client
 * has it open.
 */
import { renderHook } from "@testing-library/react";
import { globalWebSocketManager } from "../GlobalWebSocketManager";
import {
  startOpenProjectSignal,
  useOpenProjectConnection
} from "../openProjectSignal";
import {
  LOOSE_PROJECT_ID,
  useWorkspaceTabsStore
} from "../../../stores/WorkspaceTabsStore";
import { asMock } from "../../../test-utils/doubles";

jest.mock("../GlobalWebSocketManager", () => {
  const listeners = new Set<() => void>();
  return {
    emitOpen: () => listeners.forEach((listener) => listener()),
    globalWebSocketManager: {
      isConnectionOpen: jest.fn(() => true),
      ensureConnection: jest.fn(() => Promise.resolve()),
      send: jest.fn(() => Promise.resolve()),
      subscribeEvent: jest.fn((_event: string, listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      })
    }
  };
});

/** Fires the socket's `open` event at every subscribed listener. */
const { emitOpen } = jest.requireMock<{ emitOpen: () => void }>(
  "../GlobalWebSocketManager"
);
const manager = {
  isConnectionOpen: asMock(globalWebSocketManager.isConnectionOpen),
  ensureConnection: asMock(globalWebSocketManager.ensureConnection),
  send: asMock(globalWebSocketManager.send),
  emitOpen
};

const signal = (projectId: string): Record<string, unknown> => ({
  type: "set_open_project",
  command: "set_open_project",
  data: { project_id: projectId }
});

describe("startOpenProjectSignal", () => {
  let stop: () => void = () => undefined;

  beforeEach(() => {
    manager.isConnectionOpen.mockReturnValue(true);
    manager.send.mockClear();
    useWorkspaceTabsStore.setState({ activeProjectId: null });
  });

  afterEach(() => stop());

  it("sends the active project when it starts on an open socket", () => {
    useWorkspaceTabsStore.setState({ activeProjectId: "project-a" });
    stop = startOpenProjectSignal();
    expect(manager.send.mock.calls).toEqual([[signal("project-a")]]);
  });

  it("names the loose bucket when no project is active", () => {
    stop = startOpenProjectSignal();
    expect(manager.send.mock.calls).toEqual([[signal(LOOSE_PROJECT_ID)]]);
  });

  it("sends again when the active project changes, and only then", () => {
    stop = startOpenProjectSignal();
    manager.send.mockClear();

    useWorkspaceTabsStore.setState({ activeTabId: "some-tab" });
    expect(manager.send).not.toHaveBeenCalled();

    useWorkspaceTabsStore.setState({ activeProjectId: "project-b" });
    expect(manager.send.mock.calls).toEqual([[signal("project-b")]]);
  });

  it("sends when the socket opens, so a reconnect restores the signal", () => {
    useWorkspaceTabsStore.setState({ activeProjectId: "project-a" });
    manager.isConnectionOpen.mockReturnValue(false);
    stop = startOpenProjectSignal();
    expect(manager.send).not.toHaveBeenCalled();

    manager.isConnectionOpen.mockReturnValue(true);
    manager.emitOpen();
    expect(manager.send.mock.calls).toEqual([[signal("project-a")]]);
  });

  it("never opens the socket itself", () => {
    manager.isConnectionOpen.mockReturnValue(false);
    stop = startOpenProjectSignal();
    useWorkspaceTabsStore.setState({ activeProjectId: "project-b" });
    expect(manager.send).not.toHaveBeenCalled();
  });

  it("stops sending once stopped", () => {
    stop = startOpenProjectSignal();
    stop();
    manager.send.mockClear();
    useWorkspaceTabsStore.setState({ activeProjectId: "project-c" });
    manager.emitOpen();
    expect(manager.send).not.toHaveBeenCalled();
  });
});

describe("useOpenProjectConnection", () => {
  beforeEach(() => manager.ensureConnection.mockClear());

  it("opens the socket once while a view of the folder is mounted, and leaves it open after", () => {
    const view = renderHook(() => useOpenProjectConnection());
    view.rerender();
    expect(manager.ensureConnection).toHaveBeenCalledTimes(1);

    view.unmount();
    expect(manager.ensureConnection).toHaveBeenCalledTimes(1);
  });

  it("does not throw when the socket cannot be opened", async () => {
    manager.ensureConnection.mockRejectedValueOnce(new Error("offline"));
    const debug = jest.spyOn(console, "debug").mockImplementation(() => undefined);
    renderHook(() => useOpenProjectConnection());
    await Promise.resolve();
    await Promise.resolve();
    expect(debug).toHaveBeenCalledWith(
      "openProjectSignal: connection failed",
      expect.any(Error)
    );
    debug.mockRestore();
  });
});
