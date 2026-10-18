import type { StoreApi } from "zustand";

import { createDockLayoutStore, type DockLayoutState } from "../../../../stores/dock/DockLayoutStore";
import { timelineDockLayoutModel, type TimelinePanelId } from "../../../../stores/timeline/TimelineDockLayout";
import {
  createTimelineDockController, findFocusedDockGroup, focusDockPanel, type TimelineDockControllerOptions
} from "../timelineDockController";

const noStorage = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };

function setup(overrides: Partial<TimelineDockControllerOptions> = {}): {
  store: StoreApi<DockLayoutState>;
  options: { [K in keyof TimelineDockControllerOptions]: TimelineDockControllerOptions[K] };
  controller: ReturnType<typeof createTimelineDockController>;
} {
  const store = createDockLayoutStore(timelineDockLayoutModel, { anonymous: true }, noStorage);
  const options: TimelineDockControllerOptions = {
    store,
    isAvailable: () => true,
    focusedGroupId: () => null,
    focusPanel: jest.fn(),
    requestProgramFullscreen: jest.fn(),
    notify: jest.fn(),
    ...overrides
  };
  return { store, options, controller: createTimelineDockController(options) };
}

describe("timeline dock controller", () => {
  it("opens a hidden panel, makes it the active tab and focuses it", () => {
    const { store, options, controller } = setup();
    store.getState().selectLayout("Review");
    expect(store.getState().layout.hidden).toContain("assistant");
    expect(controller.openPanel("assistant")).toBe(true);
    expect(store.getState().layout.hidden).not.toContain("assistant");
    expect(store.getState().layout.regions.right[0].activePanelId).toBe("assistant");
    expect(options.focusPanel).toHaveBeenCalledWith("assistant");
  });

  it("explains a panel that has nothing to show instead of opening it", () => {
    const { store, options, controller } = setup({ isAvailable: (id: TimelinePanelId) => id !== "source" });
    store.getState().selectLayout("Script");
    expect(controller.openPanel("source")).toBe(false);
    expect(store.getState().layout.hidden).toContain("source");
    expect(options.notify).toHaveBeenCalledWith(expect.stringContaining("Select an asset"));
    expect(options.focusPanel).not.toHaveBeenCalled();
  });

  it("maximizes the focused group and restores on the second call", () => {
    const { store, controller } = setup({ focusedGroupId: () => "viewport-program" });
    controller.toggleMaximize();
    expect(store.getState().maximizedGroupId).toBe("viewport-program");
    controller.toggleMaximize();
    expect(store.getState().maximizedGroupId).toBeNull();
  });

  it("maximizes the timeline when no group has focus", () => {
    const { store, controller } = setup();
    controller.toggleMaximize();
    expect(store.getState().maximizedGroupId).toBe("bottom-main");
  });

  it("resets the workspace to the one in use", () => {
    const { store, controller } = setup();
    controller.switchWorkspace(1);
    expect(store.getState().activeLayoutName).toBe("Script");
    const script = store.getState().layout;
    store.getState().dispatch({ type: "hide", panelId: "inspector" });
    store.getState().setMaximizedGroup("bottom-main");
    controller.resetWorkspace();
    expect(store.getState().layout).toEqual(script);
    expect(store.getState().maximizedGroupId).toBeNull();
  });

  it("switches to the built-in workspaces by position and ignores a missing one", () => {
    const { store, controller } = setup();
    store.getState().setMaximizedGroup("bottom-main");
    controller.switchWorkspace(3);
    expect(store.getState().activeLayoutName).toBe("Review");
    expect(store.getState().maximizedGroupId).toBeNull();
    controller.switchWorkspace(9);
    expect(store.getState().activeLayoutName).toBe("Review");
  });

  it("asks the preview for full screen", () => {
    const { options, controller } = setup();
    controller.toggleProgramFullscreen();
    expect(options.requestProgramFullscreen).toHaveBeenCalledTimes(1);
  });
});

describe("dock focus lookup", () => {
  function dockDom(): { root: HTMLElement; tab: HTMLElement } {
    const root = document.createElement("div");
    root.innerHTML = `
      <div data-dock-group="viewport-program"><button role="tab" aria-selected="true">Program</button><div data-dock-slot><div data-dock-panel="program"><input /></div></div></div>
      <div data-dock-group="right-main"><button role="tab" aria-selected="false">Inspector</button><button role="tab" aria-selected="true">Assistant</button><div data-dock-slot><div data-dock-panel="assistant"></div></div></div>`;
    document.body.appendChild(root);
    return { root, tab: root.querySelectorAll<HTMLElement>("[role='tab']")[2] };
  }
  afterEach(() => { document.body.innerHTML = ""; });

  it("prefers the group holding focus over the one last clicked", () => {
    const { root } = dockDom();
    root.querySelector("input")?.focus();
    expect(findFocusedDockGroup(root, "right-main")).toBe("viewport-program");
  });

  it("falls back to the last clicked group, then to nothing", () => {
    const { root } = dockDom();
    expect(findFocusedDockGroup(root, "right-main")).toBe("right-main");
    expect(findFocusedDockGroup(root, null)).toBeNull();
    expect(findFocusedDockGroup(null, "right-main")).toBeNull();
  });

  it("focuses the active tab of the group showing a panel", () => {
    const { root, tab } = dockDom();
    const frame = jest.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { callback(0); return 0; });
    focusDockPanel(root, "assistant");
    expect(document.activeElement).toBe(tab);
    frame.mockRestore();
  });
});
