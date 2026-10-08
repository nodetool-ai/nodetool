import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../../__mocks__/themeMock";
import { initKeyListeners } from "../../../../stores/KeyPressedStore";
import { createGamePanelLayoutStore } from "../../../../stores/game/GamePanelLayoutStore";
import { GameLayoutMenu } from "../GameLayoutMenu";
import { GameDockGroup } from "../GameDockGroup";
import type { GameDockPresentation } from "../useGameDockPresentation";

function makeStore() {
  return createGamePanelLayoutStore({ anonymous: true }, { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
}

it("saves, selects, renames and deletes a named copy without replacing built-in layouts", async () => {
  const user = userEvent.setup();
  const store = makeStore();
  render(<ThemeProvider theme={mockTheme}><GameLayoutMenu store={store} panels={[]} /></ThemeProvider>);
  const name = screen.getByRole("textbox", { name: "Layout name" });
  await user.type(name, "My game layout");
  await user.click(screen.getByRole("button", { name: "Save layout" }));
  const saved = store.getState().layout;
  await act(async () => store.getState().selectLayout("Wide"));
  await user.click(screen.getByRole("button", { name: "Apply layout" }));
  expect(store.getState().layout).toEqual(saved);
  await user.clear(name);
  await user.type(name, "Renamed layout");
  await user.click(screen.getByRole("button", { name: "Rename layout" }));
  expect(store.getState().customLayouts.map((entry) => entry.name)).toEqual(["Renamed layout"]);
  await user.click(screen.getByRole("button", { name: "Delete layout" }));
  expect(store.getState().customLayouts).toEqual([]);
  expect(screen.getByRole("button", { name: "Rename layout" })).toBeDisabled();
});

it("offers keyboard panel movement and ordering when a panel ID matches the append sentinel", async () => {
  const user = userEvent.setup();
  const store = makeStore();
  store.getState().registerPanels([{ id: "end", title: "End extension", icon: null, dimensions: ["2d"], defaultRegion: "right" }]);
  const layout = store.getState().layout;
  const presentation: GameDockPresentation = {
    metadata: { store, layout, registry: [], dimension: "2d", availableIds: ["scripts", "inspector", "assistant", "end"] },
    views: [], transitioning: false, focusSnapshot: { current: null }
  };
  render(<ThemeProvider theme={mockTheme}><GameDockGroup group={layout.regions.bottom[0]} region="bottom"
    presentation={presentation} store={store} setSlot={() => undefined} /></ThemeProvider>);
  await user.click(screen.getByRole("combobox", { name: "Move scripts panel" }));
  await user.click(screen.getByRole("option", { name: "right: inspector, assistant, end" }));
  await user.click(screen.getByRole("combobox", { name: "Position scripts panel" }));
  await user.click(screen.getByRole("option", { name: "Before end" }));
  await user.click(screen.getByRole("button", { name: "Move" }));
  expect(store.getState().layout.regions.right[0].panels).toEqual(["inspector", "assistant", "scripts", "end"]);
  expect(store.getState().layout.regions.bottom).toEqual([]);
});

it("docks a captured pointer release and cancels the pending move when Escape or window blur interrupts it", async () => {
  const user = userEvent.setup();
  const stopKeyboard = initKeyListeners();
  const store = makeStore();
  const layout = store.getState().layout;
  const presentation: GameDockPresentation = {
    metadata: { store, layout, registry: [], dimension: "2d", availableIds: ["scripts"] },
    views: [], transitioning: false, focusSnapshot: { current: null }
  };
  const drop = document.createElement("section");
  drop.dataset.gameDockRegion = "right";
  drop.dataset.gameDockGroup = "right-main";
  document.body.appendChild(drop);
  // JSDOM has no geometry. Only browser hit testing is adapted, the gesture and store are real.
  const previousHitTest = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => drop });
  const rendered = render(<ThemeProvider theme={mockTheme}><GameDockGroup group={layout.regions.bottom[0]} region="bottom"
    presentation={presentation} store={store} setSlot={() => undefined} /></ThemeProvider>);
  try {
    const drag = screen.getByRole("button", { name: "Drag scripts panel" });
    await user.pointer({ keys: "[MouseLeft>]", target: drag });
    await user.keyboard("{Escape}");
    await user.pointer({ keys: "[/MouseLeft]", target: drag });
    expect(store.getState().layout).toBe(layout);
    await user.pointer({ keys: "[MouseLeft>]", target: drag });
    await act(async () => { window.dispatchEvent(new Event("blur")); });
    await user.pointer({ keys: "[/MouseLeft]", target: drag });
    expect(store.getState().layout).toBe(layout);
    await user.pointer({ keys: "[MouseLeft>]", target: drag });
    await user.pointer({ keys: "[/MouseLeft]", target: drag });
    expect(store.getState().layout.regions.right[0].panels).toEqual(["inspector", "assistant", "scripts"]);
    expect(store.getState().layout.regions.bottom).toEqual([]);
  } finally {
    stopKeyboard();
    await act(async () => rendered.unmount());
    drop.remove();
    if (previousHitTest) { Object.defineProperty(document, "elementFromPoint", previousHitTest); }
    else { Reflect.deleteProperty(document, "elementFromPoint"); }
  }
});
