import type { StoreApi } from "zustand";

import { createDockLayoutStore, type DockLayoutState } from "../../../../stores/dock/DockLayoutStore";
import { timelineDockLayoutModel, type TimelinePanelId } from "../../../../stores/timeline/TimelineDockLayout";
import type { DockMaximizeController } from "../../../dock/DockCanvas";
import {
  createTimelineDockController, findFocusedDockGroup, focusDockPanel, type TimelineDockControllerOptions
} from "../timelineDockController";

const noStorage = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };

/** A canvas stand-in that keeps the maximized group, as the real one does in local state. */
function fakeCanvas(initial: string | null = null): DockMaximizeController & { value: string | null } {
  const canvas = {
    value: initial,
    current: () => canvas.value,
    set: (groupId: string | null) => { canvas.value = groupId; },
    toggle: (groupId: string) => { canvas.value = canvas.value === groupId ? null : groupId; }
  };
  return canvas;
}

function setup(overrides: Partial<TimelineDockControllerOptions> = {}): {
  store: StoreApi<DockLayoutState>;
  options: { [K in keyof TimelineDockControllerOptions]: TimelineDockControllerOptions[K] };
  canvas: ReturnType<typeof fakeCanvas>;
  controller: ReturnType<typeof createTimelineDockController>;
} {
  const store = createDockLayoutStore(timelineDockLayoutModel, { anonymous: true }, noStorage);
  const canvas = fakeCanvas();
  const options: TimelineDockControllerOptions = {
    store,
    maximize: () => canvas,
    isAvailable: () => true,
    focusedGroupId: () => null,
    focusPanel: jest.fn(),
    requestProgramFullscreen: jest.fn(),
    notify: jest.fn(),
    ...overrides
  };
  return { store, options, canvas, controller: createTimelineDockController(options) };
}

describe("timeline dock controller", () => {
  it("opens a hidden panel and makes it the active tab without taking focus", () => {
    const { store, options, controller } = setup();
    store.getState().selectLayout("Review");
    expect(store.getState().layout.hidden).toContain("assistant");
    expect(controller.openPanel("assistant")).toBe(true);
    expect(store.getState().layout.hidden).not.toContain("assistant");
    expect(store.getState().layout.regions.right[0].activePanelId).toBe("assistant");
    expect(options.focusPanel).not.toHaveBeenCalled();
  });

  it("moves focus to the panel only when asked to", () => {
    const { options, controller } = setup();
    controller.openPanel("assistant", { focus: true });
    expect(options.focusPanel).toHaveBeenCalledWith("assistant");
  });

  it("leaves a maximized group that does not hold the opened panel", () => {
    const { canvas, controller } = setup();
    canvas.set("bottom-main");
    controller.openPanel("assistant");
    expect(canvas.value).toBeNull();
    canvas.set("right-main");
    controller.openPanel("inspector");
    expect(canvas.value).toBe("right-main");
  });

  it("explains a panel that has nothing to show instead of opening it", () => {
    const { store, options, controller } = setup({ isAvailable: (id: TimelinePanelId) => id !== "source" });
    store.getState().selectLayout("Script");
    expect(controller.openPanel("source", { focus: true })).toBe(false);
    expect(store.getState().layout.hidden).toContain("source");
    expect(options.notify).toHaveBeenCalledWith(expect.stringContaining("Select an asset"));
    expect(options.focusPanel).not.toHaveBeenCalled();
  });

  it("explains in DAW terms why the tracks panel has nothing to show", () => {
    const { options, controller } = setup({ isAvailable: (id: TimelinePanelId) => id !== "tracks" });
    expect(controller.openPanel("tracks")).toBe(false);
    expect(options.notify).toHaveBeenCalledWith(expect.stringContaining("DAW mode"));
    expect(options.notify).not.toHaveBeenCalledWith(expect.stringContaining("nothing to show yet"));
  });

  it("maximizes the focused group and restores on the second call", () => {
    const { canvas, controller } = setup({ focusedGroupId: () => "viewport-program" });
    controller.toggleMaximize();
    expect(canvas.value).toBe("viewport-program");
    controller.toggleMaximize();
    expect(canvas.value).toBeNull();
  });

  it("maximizes the timeline when no group has focus", () => {
    const { canvas, controller } = setup();
    controller.toggleMaximize();
    expect(canvas.value).toBe("bottom-main");
  });

  it("does nothing to maximize before a canvas has mounted", () => {
    const { controller } = setup({ maximize: () => null });
    expect(() => controller.toggleMaximize()).not.toThrow();
  });

  it("resets the workspace to the one in use", () => {
    const { store, controller } = setup();
    controller.switchWorkspace(1);
    expect(store.getState().activeLayoutName).toBe("Script");
    const script = store.getState().layout;
    store.getState().dispatch({ type: "hide", panelId: "inspector" });
    controller.resetWorkspace();
    expect(store.getState().layout).toEqual(script);
  });

  it("switches to the built-in workspaces by position and ignores a missing one", () => {
    const { store, controller } = setup();
    controller.switchWorkspace(3);
    expect(store.getState().activeLayoutName).toBe("Review");
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
