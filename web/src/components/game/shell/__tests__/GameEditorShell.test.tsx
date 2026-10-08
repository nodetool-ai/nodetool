import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { useState, type ComponentProps } from "react";

import mockTheme from "../../../../__mocks__/themeMock";
import GameEditorShell from "../GameEditorShell";
import { createGamePanelRegistry } from "../panelRegistry";
import { createGamePanelLayoutStore } from "../../../../stores/game/GamePanelLayoutStore";
import { GAME_PANEL_REGIONS } from "../../../../stores/game/GamePanelLayout";

function Shell(props: Omit<ComponentProps<typeof GameEditorShell>, "layoutStore">) {
  const [store] = useState(() => {
    const result = createGamePanelLayoutStore({ anonymous: true }, { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
    for (const panel of props.registry?.panels(props.dimension) ?? []) {
      const layout = result.getState().layout;
      const source = GAME_PANEL_REGIONS.find((region) => layout.regions[region].some((group) => group.panels.includes(panel.id)));
      if (!source || source === panel.defaultRegion) { continue; }
      const target = layout.regions[panel.defaultRegion][0];
      result.getState().dispatch({ type: "move", panelId: panel.id, region: panel.defaultRegion,
        groupId: target?.id ?? `${panel.defaultRegion}-test`, index: target?.panels.length ?? 0 });
    }
    return result;
  });
  return <GameEditorShell {...props} layoutStore={store} />;
}

const toolbar: ComponentProps<typeof GameEditorShell>["toolbar"] = {
  name: "Shell game",
  playing: false,
  playSession: false,
  loading: false,
  saving: false,
  saveStatus: "saved",
  assistantOpen: false,
  sceneTreeOpen: true,
  inspectorOpen: true,
  playHref: "/game/shell",
  onPlay: jest.fn(),
  onStop: jest.fn(),
  onStep: jest.fn(),
  onSave: jest.fn(),
  onLoad: jest.fn(),
  onPublish: jest.fn(),
  onAssistant: jest.fn(),
  onSceneTree: jest.fn(),
  onInspector: jest.fn()
};
const status = { tick: 0, score: 0, won: false, backend: "Test" };

it("routes a public registered panel to its named default region and disposes registration", async () => {
  const registry = createGamePanelRegistry();
  const dispose = registry.register({
    id: "extension", title: "Extension", icon: null,
    dimensions: ["2d"], defaultRegion: "bottom"
  });
  const view = (dimension: "2d" | "3d") => (
    <ThemeProvider theme={mockTheme}>
      <Shell dimension={dimension} registry={registry} toolbar={toolbar} status={status}
        panels={[{ id: "extension", node: <button>Extension action</button> }]} />
    </ThemeProvider>
  );
  const rendered = render(view("2d"));
  expect(within(screen.getByRole("region", { name: "Game bottom panels" }))
    .getByRole("button", { name: "Extension action" })).toBeInTheDocument();
  await act(async () => rendered.rerender(view("3d")));
  expect(screen.queryByRole("button", { name: "Extension action" })).not.toBeInTheDocument();
  await act(async () => { dispose(); dispose(); });
  await act(async () => rendered.rerender(view("2d")));
  expect(screen.queryByRole("button", { name: "Extension action" })).not.toBeInTheDocument();
  expect(registry.panels("2d")).toEqual([]);
});

it("updates an already mounted shell when a public extension registers and disposes", async () => {
  const registry = createGamePanelRegistry();
  render(<ThemeProvider theme={mockTheme}><Shell dimension="2d" registry={registry} toolbar={toolbar} status={status}
    panels={[{ id: "late-extension", node: <button>Live extension action</button> }]} /></ThemeProvider>);
  expect(screen.queryByRole("button", { name: "Live extension action" })).not.toBeInTheDocument();
  let dispose = (): void => undefined;
  await act(async () => { dispose = registry.register({ id: "late-extension", title: "Live extension", icon: null, dimensions: ["2d"], defaultRegion: "bottom" }); });
  expect(screen.getByRole("button", { name: "Live extension action" })).toBeInTheDocument();
  await act(async () => dispose());
  expect(screen.queryByRole("button", { name: "Live extension action" })).not.toBeInTheDocument();
});

it("rejects duplicate panel identities", () => {
  const registry = createGamePanelRegistry();
  const panel = { id: "same", title: "Same", icon: null, dimensions: ["2d"] as const, defaultRegion: "left" as const };
  registry.register(panel);
  expect(() => registry.register(panel)).toThrow("same");
});

it("keeps the viewport mounted when an adjacent panel is hidden", async () => {
  const user = userEvent.setup();
  const registry = createGamePanelRegistry();
  registry.register({ id: "first", title: "First", icon: null, dimensions: ["2d"], defaultRegion: "viewport" });
  registry.register({ id: "viewport", title: "Viewport", icon: null, dimensions: ["2d"], defaultRegion: "viewport" });
  const view = (visible: boolean) => (
    <ThemeProvider theme={mockTheme}>
      <Shell dimension="2d" registry={registry} toolbar={toolbar} status={status}
        panels={[
          { id: "first", visible, node: <span>Optional panel</span> },
          { id: "viewport", node: <input aria-label="Viewport focus" /> }
        ]} />
    </ThemeProvider>
  );
  const rendered = render(view(true));
  const input = screen.getByRole("textbox", { name: "Viewport focus" });
  await user.click(input);
  await act(async () => rendered.rerender(view(false)));
  expect(screen.getByRole("textbox", { name: "Viewport focus" })).toBe(input);
  expect(input).toHaveFocus();
});

it("routes editor keys once and preserves editable, handled and gameplay input", async () => {
  const user = userEvent.setup();
  const registry = createGamePanelRegistry();
  registry.register({ id: "viewport", title: "Viewport", icon: null, dimensions: ["2d"], defaultRegion: "viewport" });
  const undo = jest.fn();
  const view = (playSession: boolean) => <ThemeProvider theme={mockTheme}>
    <Shell dimension="2d" registry={registry} toolbar={{ ...toolbar, playSession }} status={status}
      onKeyDown={(event) => { if (event.ctrlKey && event.code === "KeyZ") { event.preventDefault(); undo(); } }}
      panels={[{ id: "viewport", keyboardScope: true, node: <>
        <button>Editor canvas</button>
        <button onKeyDown={(event) => event.preventDefault()}>Handled input</button>
        <textarea aria-label="Script source" />
      </> }]} />
  </ThemeProvider>;
  const rendered = render(view(false));
  await user.click(screen.getByRole("button", { name: "Editor canvas" }));
  await user.keyboard("{Control>}z{/Control}");
  expect(undo).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole("button", { name: "Handled input" }));
  await user.keyboard("{Control>}z{/Control}");
  await user.click(screen.getByRole("textbox", { name: "Script source" }));
  await user.keyboard("{Control>}z{/Control}");
  expect(undo).toHaveBeenCalledTimes(1);
  await act(async () => rendered.rerender(view(true)));
  await user.click(screen.getByRole("button", { name: "Editor canvas" }));
  await user.keyboard("{Control>}z{/Control}");
  expect(undo).toHaveBeenCalledTimes(1);
});

it("keeps unscoped inspector controls outside editor shortcut routing", async () => {
  const user = userEvent.setup();
  const registry = createGamePanelRegistry();
  registry.register({ id: "inspector", title: "Inspector", icon: null, dimensions: ["2d"], defaultRegion: "right" });
  const onKeyDown = jest.fn();
  render(<ThemeProvider theme={mockTheme}><Shell dimension="2d" registry={registry} toolbar={toolbar}
    status={status} onKeyDown={onKeyDown} panels={[{ id: "inspector", node: <button>Inspector action</button> }]} /></ThemeProvider>);
  await user.click(screen.getByRole("button", { name: "Inspector action" }));
  await user.keyboard("{Control>}z{/Control}{Delete}");
  expect(onKeyDown).not.toHaveBeenCalled();
});

it.each([
  ["2d", "left"], ["3d", "left"], ["2d", "viewport"], ["3d", "viewport"]
] as const)("keeps %s adjacent controls unscoped in the %s region", async (dimension, region) => {
  const user = userEvent.setup();
  const registry = createGamePanelRegistry();
  for (const id of ["hierarchy", "revisions"]) {
    registry.register({ id, title: id, icon: null, dimensions: [dimension], defaultRegion: region });
  }
  const onKeyDown = jest.fn();
  render(<ThemeProvider theme={mockTheme}><Shell dimension={dimension} registry={registry}
    toolbar={toolbar} status={status} onKeyDown={onKeyDown} panels={[
      { id: "hierarchy", keyboardScope: true, node: <button>Hierarchy selection</button> },
      { id: "revisions", node: <button>Restore to draft</button> }
    ]} /></ThemeProvider>);
  await user.click(screen.getByRole("tab", { name: "revisions" }));
  await user.click(screen.getByRole("button", { name: "Restore to draft" }));
  await user.keyboard("{Control>}z{/Control}{Delete}");
  expect(onKeyDown).not.toHaveBeenCalled();
  await user.click(screen.getByRole("tab", { name: "hierarchy" }));
  await user.click(screen.getByRole("button", { name: "Hierarchy selection" }));
  await user.keyboard("{Delete}");
  expect(onKeyDown).toHaveBeenCalledTimes(1);
});


it.each(["2d", "3d"] as const)("keeps a late registered %s panel reachable when applying an older saved layout", async (dimension) => {
  const user = userEvent.setup();
  const registry = createGamePanelRegistry();
  render(<ThemeProvider theme={mockTheme}><Shell dimension={dimension} registry={registry} toolbar={toolbar} status={status}
    panels={[{ id: "late-extension", node: <input aria-label="Extension draft" defaultValue="original" /> }]} /></ThemeProvider>);
  await user.type(screen.getByRole("textbox", { name: "Layout name" }), "Before extension");
  await user.click(screen.getByRole("button", { name: "Save layout" }));
  await act(async () => {
    registry.register({ id: "late-extension", title: "Live extension", icon: null, dimensions: [dimension], defaultRegion: "bottom" });
  });
  const input = screen.getByRole("textbox", { name: "Extension draft" });
  await user.type(input, " changed");
  await user.click(screen.getByRole("button", { name: "Apply layout" }));
  expect(screen.getByRole("tab", { name: "Live extension" })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Extension draft" })).toBe(input);
  expect(input).toHaveValue("original changed");
});

it.each(["2d", "3d"] as const)("reveals a hidden registered %s panel through the layout controls without replacing its draft", async (dimension) => {
  const user = userEvent.setup();
  const registry = createGamePanelRegistry();
  registry.register({ id: "extension", title: "Extension", icon: null, dimensions: [dimension], defaultRegion: "bottom" });
  render(<ThemeProvider theme={mockTheme}><Shell dimension={dimension} registry={registry} toolbar={toolbar} status={status}
    panels={[{ id: "extension", node: <input aria-label="Extension draft" defaultValue="original" /> }]} /></ThemeProvider>);
  const input = screen.getByRole("textbox", { name: "Extension draft" });
  await user.type(input, " changed");
  await user.click(within(screen.getByRole("region", { name: "Game bottom panels" })).getByRole("button", { name: "Hide" }));
  expect(screen.queryByRole("textbox", { name: "Extension draft" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Apply layout" }));
  expect(screen.queryByRole("textbox", { name: "Extension draft" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("combobox", { name: "Show panel" }));
  await user.click(screen.getByRole("option", { name: "Extension" }));
  expect(screen.getByRole("textbox", { name: "Extension draft" })).toBe(input);
  expect(input).toHaveValue("original changed");
  expect(screen.queryByRole("combobox", { name: "Show panel" })).not.toBeInTheDocument();
});

it("offers only hidden panels registered and available in the current dimension", async () => {
  const user = userEvent.setup();
  const registry = createGamePanelRegistry();
  const store = createGamePanelLayoutStore({ anonymous: true }, { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
  let removePanel = (): void => undefined;
  for (const id of ["eligible", "unavailable", "other-dimension", "removed"]) {
    const dispose = registry.register({ id, title: id, icon: null, dimensions: [id === "other-dimension" ? "3d" : "2d"], defaultRegion: "bottom" });
    if (id === "removed") { removePanel = dispose; }
  }
  store.getState().registerPanels(registry.getSnapshot());
  for (const panel of registry.getSnapshot()) { store.getState().dispatch({ type: "hide", panelId: panel.id }); }
  removePanel();
  render(<ThemeProvider theme={mockTheme}><GameEditorShell dimension="2d" registry={registry} layoutStore={store} toolbar={toolbar} status={status}
    panels={["eligible", "unavailable", "other-dimension", "removed"].map((id) => ({ id, visible: id !== "unavailable", node: <span>{id}</span> }))} /></ThemeProvider>);
  await user.click(screen.getByRole("combobox", { name: "Show panel" }));
  expect(screen.getByRole("option", { name: "eligible" })).toBeInTheDocument();
  for (const name of ["unavailable", "other-dimension", "removed"]) {
    expect(screen.queryByRole("option", { name })).not.toBeInTheDocument();
  }
});
