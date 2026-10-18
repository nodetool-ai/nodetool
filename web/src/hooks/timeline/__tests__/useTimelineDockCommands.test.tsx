import { act, renderHook } from "@testing-library/react";

import { useCommandMenuStore } from "../../../stores/CommandMenuStore";
import { useSettingsStore } from "../../../stores/SettingsStore";
import { createDockLayoutStore } from "../../../stores/dock/DockLayoutStore";
import { TIMELINE_PANEL_IDS, timelineDockLayoutModel } from "../../../stores/timeline/TimelineDockLayout";
import type { TimelineDockController } from "../../../components/timeline/dock/timelineDockController";
import { useTimelineDockCommands } from "../useTimelineDockCommands";

const noStorage = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };

function makeController(): jest.Mocked<TimelineDockController> {
  return {
    openPanel: jest.fn(() => true),
    toggleMaximize: jest.fn(),
    toggleProgramFullscreen: jest.fn(),
    resetWorkspace: jest.fn(),
    switchWorkspace: jest.fn()
  } as unknown as jest.Mocked<TimelineDockController>;
}

function commands(): Map<string, { label: string; shortcut?: string; run: () => unknown }> {
  const found = new Map<string, { label: string; shortcut?: string; run: () => unknown }>();
  for (const group of useCommandMenuStore.getState().contextGroups) {
    if (group.heading === "Workspace") {
      for (const command of group.commands) { found.set(command.id, command); }
    }
  }
  return found;
}

describe("useTimelineDockCommands", () => {
  beforeEach(() => {
    useCommandMenuStore.setState({ contextGroups: [] });
    useSettingsStore.setState((state) => ({ settings: { ...state.settings, timelineKeyboardPreset: "premiere" } }));
  });

  it("lists nothing without a dock", () => {
    const store = createDockLayoutStore(timelineDockLayoutModel, { anonymous: true }, noStorage);
    renderHook(() => useTimelineDockCommands(null, store));
    expect(commands().size).toBe(0);
  });

  it("opens each panel, maximizes, resets and switches workspace through the controller", () => {
    const store = createDockLayoutStore(timelineDockLayoutModel, { anonymous: true }, noStorage);
    const controller = makeController();
    renderHook(() => useTimelineDockCommands(controller, store));
    const list = commands();
    for (const id of TIMELINE_PANEL_IDS) { expect(list.has(`dock.open.${id}`)).toBe(true); }
    act(() => { list.get("dock.open.assistant")?.run(); });
    expect(controller.openPanel).toHaveBeenCalledWith("assistant");
    act(() => { list.get("dock.maximize")?.run(); });
    expect(controller.toggleMaximize).toHaveBeenCalled();
    act(() => { list.get("dock.fullscreen")?.run(); });
    expect(controller.toggleProgramFullscreen).toHaveBeenCalled();
    act(() => { list.get("dock.reset")?.run(); });
    expect(controller.resetWorkspace).toHaveBeenCalled();
    act(() => { list.get("dock.workspace.2")?.run(); });
    expect(controller.switchWorkspace).toHaveBeenCalledWith(2);
  });

  it("shows the keys of the active keyboard preset", () => {
    const store = createDockLayoutStore(timelineDockLayoutModel, { anonymous: true }, noStorage);
    renderHook(() => useTimelineDockCommands(makeController(), store));
    const list = commands();
    expect(list.get("dock.maximize")?.shortcut).toBeTruthy();
    expect(list.get("dock.workspace.0")?.shortcut).toBeTruthy();
  });

  it("lists saved layouts and switches to one", () => {
    const store = createDockLayoutStore(timelineDockLayoutModel, { anonymous: true }, noStorage);
    store.getState().dispatch({ type: "resize", region: "left", size: 410 });
    store.getState().saveLayout("Mine");
    store.getState().selectLayout("Review");
    renderHook(() => useTimelineDockCommands(makeController(), store));
    act(() => { commands().get("dock.saved.Mine")?.run(); });
    expect(store.getState().layout.sizes.left).toBe(410);
  });
});
