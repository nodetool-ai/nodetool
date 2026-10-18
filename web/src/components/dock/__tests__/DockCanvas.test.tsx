import { useLayoutEffect, useRef, type ReactNode } from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { useStore, type StoreApi } from "zustand";

import mockTheme from "../../../__mocks__/themeMock";
import { createSampleDockStore, sampleDockModel } from "../../../__mocks__/sampleDockModel";
import { createDockLayoutStore, type DockLayoutState } from "../../../stores/dock/DockLayoutStore";
import { DockCanvas } from "../DockCanvas";
import { useDockPresentation, type DockPanelView } from "../useDockPresentation";

import type { DockPanelRegistration } from "../panelRegistry";

const registry: readonly DockPanelRegistration[] = [
  { id: "viewport", title: "Viewport", icon: null, defaultRegion: "viewport" },
  { id: "scripts", title: "Scripts", icon: null, defaultRegion: "bottom" }
];
function makeStore(): StoreApi<DockLayoutState> {
  return createSampleDockStore({ anonymous: true }, { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
}
function DuringTransition({ transitioning, interrupt }: { transitioning: boolean; interrupt?: () => void }): null {
  useLayoutEffect(() => { if (transitioning) { interrupt?.(); } }, [transitioning, interrupt]);
  return null;
}
function Harness({ store, scriptAvailable = true, interrupt }: { store: StoreApi<DockLayoutState>; scriptAvailable?: boolean; interrupt?: () => void }): ReactNode {
  const root = useRef<HTMLDivElement | null>(null);
  const layout = useStore(store, (state) => state.layout);
  const views: readonly DockPanelView[] = [
    { id: "viewport", node: <canvas aria-label="Actual viewport node" tabIndex={0} /> },
    ...(scriptAvailable ? [{ id: "scripts", node: <textarea aria-label="Script source" defaultValue="retained draft" /> }] : [])
  ];
  const presentation = useDockPresentation({ root, store, layout, registry, availableIds: views.map((view) => view.id), views });
  return <ThemeProvider theme={mockTheme}><section ref={root}><DockCanvas presentation={presentation} store={store} /><DuringTransition transitioning={presentation.transitioning} interrupt={interrupt} /></section></ThemeProvider>;
}

it("keeps actual focused script DOM and draft text when moving its sole group into a newly mounted group", async () => {
  const user = userEvent.setup();
  const store = makeStore();
  render(<Harness store={store} />);
  const source = screen.getByRole("textbox", { name: "Script source" });
  const canvas = screen.getByLabelText("Actual viewport node");
  await user.click(source);
  await user.type(source, " edited");
  await act(async () => store.getState().dispatch({ type: "move", panelId: "scripts", region: "right", groupId: "new-script-group", index: 0 }));
  expect(screen.getByRole("textbox", { name: "Script source" })).toBe(source);
  expect(source).toHaveFocus();
  expect(source).toHaveValue("retained draft edited");
  expect(screen.getByLabelText("Actual viewport node")).toBe(canvas);
  await act(async () => store.getState().dispatch({ type: "move", panelId: "scripts", region: "left", groupId: "second-script-group", index: 0 }));
  expect(source).toHaveFocus();
  expect(screen.getByRole("textbox", { name: "Script source" })).toBe(source);
});

it("moves focus out of hidden or inactive content and reuses its DOM when revealed", async () => {
  const user = userEvent.setup();
  const store = makeStore();
  render(<Harness store={store} />);
  const source = screen.getByRole("textbox", { name: "Script source" });
  await user.click(source);
  await act(async () => store.getState().dispatch({ type: "hide", panelId: "scripts" }));
  expect(screen.queryByRole("textbox", { name: "Script source" })).not.toBeInTheDocument();
  expect(source).not.toHaveFocus();
  expect(document.activeElement).not.toBe(document.body);
  await act(async () => store.getState().dispatch({ type: "reveal", panelId: "scripts" }));
  expect(screen.getByRole("textbox", { name: "Script source" })).toBe(source);
  await user.click(source);
  await act(async () => store.getState().dispatch({ type: "move", panelId: "scripts", region: "viewport", groupId: "viewport-main", index: 1 }));
  expect(source).toHaveFocus();
  await act(async () => store.getState().dispatch({ type: "activate", panelId: "viewport" }));
  expect(source).not.toHaveFocus();
  expect(screen.queryByRole("textbox", { name: "Script source" })).not.toBeInTheDocument();
});

it("does not restore a removed script selection during rapid availability and layout transitions", async () => {
  const user = userEvent.setup();
  const store = makeStore();
  const rendered = render(<Harness store={store} />);
  const source = screen.getByRole("textbox", { name: "Script source" });
  await user.click(source);
  await act(async () => rendered.rerender(<Harness store={store} scriptAvailable={false} />));
  await act(async () => {
    store.getState().selectLayout("Wide");
    store.getState().selectLayout("Default");
  });
  expect(screen.queryByRole("textbox", { name: "Script source" })).not.toBeInTheDocument();
  expect(source.isConnected).toBe(false);
  expect(document.activeElement).not.toBe(source);
});


it("clamps measured panel sizes without overwriting requested sizes, then resizes through the real separator", async () => {
  const user = userEvent.setup();
  const originalObserver = globalThis.ResizeObserver;
  let reportBounds: (width: number, height: number) => void = () => undefined;
  class MeasuredObserver {
    constructor(callback: ResizeObserverCallback) {
      reportBounds = (width, height) => callback([
        // Only contentRect is consumed; this adapter supplies measured geometry.
        { contentRect: { width, height } } as unknown as ResizeObserverEntry
      ], this as unknown as ResizeObserver);
    }
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = MeasuredObserver as unknown as typeof ResizeObserver;
  const store = makeStore();
  store.getState().dispatch({ type: "move", panelId: "scripts", region: "left", groupId: "measured-script-group", index: 0 });
  store.getState().dispatch({ type: "resize", region: "left", size: 600 });
  const rendered = render(<Harness store={store} />);
  try {
    await act(async () => reportBounds(900, 800));
    const handle = screen.getByRole("separator", { name: "Resize sample left panels" });
    expect(handle).toHaveAttribute("aria-valuenow", "300");
    expect(store.getState().layout.sizes.left).toBe(600);
    await act(async () => reportBounds(2400, 800));
    expect(handle).toHaveAttribute("aria-valuenow", "600");
    expect(store.getState().layout.sizes.left).toBe(600);
    handle.focus();
    await user.keyboard("{ArrowRight}");
    expect(handle).toHaveAttribute("aria-valuenow", "616");
    expect(store.getState().layout.sizes.left).toBe(616);
    await user.keyboard("{End}");
    expect(handle).toHaveAttribute("aria-valuenow", "800");
    expect(store.getState().layout.sizes.left).toBe(800);
    await act(async () => reportBounds(600, 800));
    expect(handle).toHaveAttribute("aria-valuenow", "200");
    expect(store.getState().layout.sizes.left).toBe(800);
    await act(async () => reportBounds(2400, 800));
    expect(handle).toHaveAttribute("aria-valuenow", "800");
    await user.keyboard("{Home}");
    expect(handle).toHaveAttribute("aria-valuenow", "100");
    expect(store.getState().layout.sizes.left).toBe(100);
  } finally {
    await act(async () => rendered.unmount());
    globalThis.ResizeObserver = originalObserver;
  }
});


it("retains focus when a second layout move arrives before the first transition settles", async () => {
  const user = userEvent.setup();
  const store = makeStore();
  let interruptions = 0;
  const interrupt = (): void => {
    if (interruptions !== 0) { return; }
    interruptions++;
    store.getState().dispatch({ type: "move", panelId: "scripts", region: "left", groupId: "interrupting-group", index: 0 });
  };
  render(<Harness store={store} interrupt={interrupt} />);
  const source = screen.getByRole("textbox", { name: "Script source" });
  await user.click(source);
  await user.type(source, " interrupted draft");
  await act(async () => store.getState().dispatch({ type: "move", panelId: "scripts", region: "right", groupId: "first-pending-group", index: 0 }));
  expect(interruptions).toBe(1);
  expect(source.closest("[data-dock-group]")).toHaveAttribute("data-dock-group", "interrupting-group");
  expect(store.getState().layout.regions.left.find((group) => group.id === "interrupting-group")?.panels).toEqual(["scripts"]);
  expect(screen.getByRole("textbox", { name: "Script source" })).toBe(source);
  expect(source).toHaveFocus();
  expect(source).toHaveValue("retained draft interrupted draft");
});

it("maximizes through the store, so a command outside the canvas can toggle it", async () => {
  const store = makeStore();
  render(<Harness store={store} />);
  expect(screen.getByRole("region", { name: "Sample viewport panels" })).toBeInTheDocument();
  await act(async () => store.getState().toggleMaximizedPanel("scripts"));
  expect(screen.queryByRole("region", { name: "Sample viewport panels" })).not.toBeInTheDocument();
  expect(screen.getByRole("tablist", { name: "bottom sample panel tabs" })).toBeInTheDocument();
  expect(screen.queryByRole("tab", { name: /Viewport/ })).not.toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Script source" })).toBeVisible();
  await act(async () => store.getState().toggleMaximizedPanel("scripts"));
  expect(screen.getByRole("region", { name: "Sample viewport panels" })).toBeInTheDocument();
  await act(async () => store.getState().toggleMaximizedPanel("scripts"));
  await act(async () => store.getState().dispatch({ type: "hide", panelId: "scripts" }));
  expect(store.getState().maximizedGroupId).toBeNull();
  expect(screen.getByRole("region", { name: "Sample viewport panels" })).toBeInTheDocument();
});

it("maximizes a focused tab's group with Shift+Space", async () => {
  const user = userEvent.setup();
  const store = makeStore();
  render(<Harness store={store} />);
  await act(async () => screen.getByRole("tab", { name: /Scripts/ }).focus());
  await user.keyboard("{Shift>} {/Shift}");
  expect(store.getState().maximizedGroupId).toBe("bottom-main");
});

it("lets an editor raise the share of the height the bottom panels may take", async () => {
  const originalObserver = globalThis.ResizeObserver;
  let reportBounds: (width: number, height: number) => void = () => undefined;
  class MeasuredObserver {
    constructor(callback: ResizeObserverCallback) {
      reportBounds = (width, height) => callback([
        { contentRect: { width, height } } as unknown as ResizeObserverEntry
      ], this as unknown as ResizeObserver);
    }
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = MeasuredObserver as unknown as typeof ResizeObserver;
  const noStorage = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
  const halfStore = makeStore();
  const tallStore = createDockLayoutStore({ ...sampleDockModel, maxBottomFraction: 0.8 }, { anonymous: true }, noStorage);
  try {
    const half = render(<Harness store={halfStore} />);
    await act(async () => reportBounds(1200, 800));
    expect(screen.getByRole("separator", { name: "Resize sample bottom panels" })).toHaveAttribute("aria-valuemax", "400");
    half.unmount();
    render(<Harness store={tallStore} />);
    await act(async () => reportBounds(1200, 800));
    expect(screen.getByRole("separator", { name: "Resize sample bottom panels" })).toHaveAttribute("aria-valuemax", "640");
  } finally {
    globalThis.ResizeObserver = originalObserver;
  }
});
