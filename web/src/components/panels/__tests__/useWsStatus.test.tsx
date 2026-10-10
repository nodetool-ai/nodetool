import { act, renderHook } from "@testing-library/react";
import { useWsStatus } from "../PanelBottom";

jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: () => undefined
}));
jest.mock("../../../hooks/useRunningJobs", () => ({
  useRunningJobs: () => ({ data: [] })
}));
const socket = {
  open: false,
  started: false,
  connecting: false,
  listeners: new Set<() => void>()
};

jest.mock("../../../lib/websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: {
    isConnectionOpen: () => socket.open,
    hasConnectionStarted: () => socket.started,
    getConnectionState: () => ({
      isConnected: socket.open,
      isConnecting: socket.connecting
    }),
    subscribeEvent: (_event: string, listener: () => void) => {
      socket.listeners.add(listener);
      return () => socket.listeners.delete(listener);
    }
  }
}));

const emit = (next: Partial<typeof socket>) => {
  Object.assign(socket, next);
  socket.listeners.forEach((listener) => listener());
};
jest.mock("../TracePanel", () => () => null);
jest.mock("../LogPanel", () => () => null);
jest.mock("../jobs/QueuePanel", () => () => null);
jest.mock("../../workers/WorkersPanel", () => () => null);
jest.mock("../../workers/WorkerStatusIndicator", () => () => null);
jest.mock("../../context_menus/ContextMenus", () => () => null);
jest.mock("../../version/VersionHistoryPanel", () => ({
  VersionHistoryPanel: () => null
}));

describe("useWsStatus", () => {
  it("reads idle, not offline, before anything has opened the connection", () => {
    const { result } = renderHook(() => useWsStatus());
    expect(result.current).toBe("idle");

    act(() => emit({ started: true, connecting: true }));
    expect(result.current).toBe("connecting");

    act(() => emit({ open: true, connecting: false }));
    expect(result.current).toBe("connected");

    act(() => emit({ open: false }));
    expect(result.current).toBe("offline");
  });
});
