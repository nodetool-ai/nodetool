import { useRef, type ReactNode } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { useStore, type StoreApi } from "zustand";

import mockTheme from "../../../__mocks__/themeMock";
import { initKeyListeners } from "../../../stores/KeyPressedStore";
import { createSampleDockStore } from "../../../__mocks__/sampleDockModel";
import type { DockLayoutState } from "../../../stores/dock/DockLayoutStore";
import { DockLayoutMenu } from "../DockLayoutMenu";
import { DockCanvas } from "../DockCanvas";
import { useDockPresentation, type DockPanelView } from "../useDockPresentation";

import type { DockPanelRegistration } from "../panelRegistry";

function makeStore(): StoreApi<DockLayoutState> {
  return createSampleDockStore({ anonymous: true }, { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
}

const registry: readonly DockPanelRegistration[] = ["viewport", "scripts", "inspector", "assistant"].map((id) => ({
  id, title: id[0].toUpperCase() + id.slice(1), icon: null, defaultRegion: "bottom"
}));

function Dock({ store }: { store: StoreApi<DockLayoutState> }): ReactNode {
  const root = useRef<HTMLDivElement | null>(null);
  const layout = useStore(store, (state) => state.layout);
  const views: readonly DockPanelView[] = registry.map((entry) => ({ id: entry.id, node: <span>{entry.title} body</span> }));
  const presentation = useDockPresentation({ root, store, layout, registry, availableIds: views.map((view) => view.id), views });
  return <section ref={root}><DockCanvas presentation={presentation} store={store} /></section>;
}

it("saves, selects, renames and deletes a named copy without replacing built-in layouts", async () => {
  const user = userEvent.setup();
  const store = makeStore();
  render(<ThemeProvider theme={mockTheme}><DockLayoutMenu store={store} panels={[]} /></ThemeProvider>);
  await user.click(screen.getByRole("button", { name: "Default" }));
  await user.click(screen.getByRole("menuitem", { name: "Save layout as…" }));
  await user.type(screen.getByRole("textbox", { name: "Layout name" }), "My game layout");
  await user.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  const saved = store.getState().layout;
  await user.click(screen.getByRole("button", { name: "My game layout" }));
  await user.click(screen.getByRole("menuitem", { name: "Wide" }));
  expect(store.getState().layout).not.toEqual(saved);
  await user.click(screen.getByRole("button", { name: "Wide" }));
  expect(screen.getByRole("menuitem", { name: "Rename layout…" })).toHaveAttribute("aria-disabled", "true");
  await user.click(screen.getByRole("menuitem", { name: "My game layout" }));
  expect(store.getState().layout).toEqual(saved);
  await user.click(screen.getByRole("button", { name: "My game layout" }));
  await user.click(screen.getByRole("menuitem", { name: "Rename layout…" }));
  const name = screen.getByRole("textbox", { name: "Layout name" });
  await user.clear(name);
  await user.type(name, "Renamed layout{Enter}");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(store.getState().customLayouts.map((entry) => entry.name)).toEqual(["Renamed layout"]);
  await user.click(screen.getByRole("button", { name: "Renamed layout" }));
  await user.click(screen.getByRole("menuitem", { name: "Delete layout" }));
  expect(store.getState().customLayouts).toEqual([]);
  expect(screen.getByRole("button", { name: "Default" })).toBeInTheDocument();
});

it("moves, reorders and closes panels from the tab menu by keyboard", async () => {
  const user = userEvent.setup();
  const store = makeStore();
  store.getState().registerPanels(registry);
  render(<ThemeProvider theme={mockTheme}><Dock store={store} /></ThemeProvider>);
  const bottom = store.getState().layout.regions.bottom[0];
  const tab = screen.getByRole("tab", { name: "Scripts" });
  tab.focus();
  await user.keyboard("{Shift>}{F10}{/Shift}");
  await user.click(screen.getByRole("menuitem", { name: "Move to right dock" }));
  expect(store.getState().layout.regions.right[0].panels.at(-1)).toBe("scripts");
  expect(store.getState().layout.regions.bottom.some((group) => group.panels.includes("scripts"))).toBe(false);
  const rightTabs = within(screen.getByRole("tablist", { name: "right sample panel tabs" }));
  rightTabs.getByRole("tab", { name: "Scripts" }).focus();
  await user.keyboard("{Shift>}{F10}{/Shift}");
  await user.click(screen.getByRole("menuitem", { name: "Move tab left" }));
  // The assistant starts hidden, so the only shown tab left of Scripts is Inspector.
  expect(store.getState().layout.regions.right[0].panels).toEqual(["scripts", "inspector", "assistant"]);
  rightTabs.getByRole("tab", { name: "Scripts" }).focus();
  await user.keyboard("{Delete}");
  expect(store.getState().layout.hidden).toContain("scripts");
  expect(bottom).toBeDefined();
});

it("docks a dragged tab onto a group edge and cancels the drag on Escape or window blur", async () => {
  const user = userEvent.setup();
  const stopKeyboard = initKeyListeners();
  const store = makeStore();
  store.getState().registerPanels(registry);
  const rendered = render(<ThemeProvider theme={mockTheme}><Dock store={store} /></ThemeProvider>);
  const layout = store.getState().layout;
  const rightGroup = layout.regions.right[0];
  const body = document.querySelector<HTMLElement>(`[data-dock-group='${rightGroup.id}'] [data-dock-body]`);
  if (!body) { throw new Error("right group body missing"); }
  // JSDOM has no geometry. Only browser hit testing is adapted, the gesture and store are real.
  const previousHitTest = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => body });
  body.getBoundingClientRect = () => ({ left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100, x: 0, y: 0, toJSON: () => ({}) });
  const tab = screen.getByRole("tab", { name: "Scripts" });
  try {
    await user.pointer({ keys: "[MouseLeft>]", target: tab, coords: { clientX: 10, clientY: 10 } });
    await user.pointer({ target: tab, coords: { clientX: 50, clientY: 95 } });
    await user.keyboard("{Escape}");
    await user.pointer({ keys: "[/MouseLeft]", target: tab });
    expect(store.getState().layout).toBe(layout);
    await user.pointer({ keys: "[MouseLeft>]", target: tab, coords: { clientX: 10, clientY: 10 } });
    await user.pointer({ target: tab, coords: { clientX: 50, clientY: 95 } });
    await act(async () => { window.dispatchEvent(new Event("blur")); });
    await user.pointer({ keys: "[/MouseLeft]", target: tab });
    expect(store.getState().layout).toBe(layout);
    await user.pointer({ keys: "[MouseLeft>]", target: tab, coords: { clientX: 10, clientY: 10 } });
    await user.pointer({ target: tab, coords: { clientX: 50, clientY: 95 } });
    await user.pointer({ keys: "[/MouseLeft]", target: tab, coords: { clientX: 50, clientY: 95 } });
    const right = store.getState().layout.regions.right;
    expect(right).toHaveLength(2);
    expect(right[0].id).toBe(rightGroup.id);
    expect(right[1].panels).toEqual(["scripts"]);
  } finally {
    stopKeyboard();
    await act(async () => rendered.unmount());
    if (previousHitTest) { Object.defineProperty(document, "elementFromPoint", previousHitTest); }
    else { Reflect.deleteProperty(document, "elementFromPoint"); }
  }
});

it("resets to the layout in use from the Layout menu", async () => {
  const user = userEvent.setup();
  const store = makeStore();
  render(<ThemeProvider theme={mockTheme}><DockLayoutMenu store={store} panels={[]} /></ThemeProvider>);
  await user.click(screen.getByRole("button", { name: "Default" }));
  await user.click(screen.getByRole("menuitem", { name: "Scripting" }));
  const scripting = store.getState().layout;
  act(() => store.getState().dispatch({ type: "resize", region: "bottom", size: 700 }));
  await user.click(screen.getByRole("button", { name: "Scripting" }));
  await user.click(screen.getByRole("menuitem", { name: "Reset to saved layout" }));
  expect(store.getState().layout).toEqual(scripting);
});
