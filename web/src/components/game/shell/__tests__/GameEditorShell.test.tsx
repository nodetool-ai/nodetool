import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { ComponentProps } from "react";

import mockTheme from "../../../../__mocks__/themeMock";
import GameEditorShell from "../GameEditorShell";
import { createGamePanelRegistry } from "../panelRegistry";

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

it("routes a public registered panel to its named default region and disposes registration", () => {
  const registry = createGamePanelRegistry();
  const dispose = registry.register({
    id: "extension", title: "Extension", icon: null,
    dimensions: ["2d"], defaultRegion: "bottom"
  });
  const view = (dimension: "2d" | "3d") => (
    <ThemeProvider theme={mockTheme}>
      <GameEditorShell dimension={dimension} registry={registry} toolbar={toolbar} status={status}
        panels={[{ id: "extension", node: <button>Extension action</button> }]} />
    </ThemeProvider>
  );
  const rendered = render(view("2d"));
  expect(within(screen.getByRole("region", { name: "Game bottom panels" }))
    .getByRole("button", { name: "Extension action" })).toBeInTheDocument();
  rendered.rerender(view("3d"));
  expect(screen.queryByRole("button", { name: "Extension action" })).not.toBeInTheDocument();
  dispose();
  dispose();
  rendered.rerender(view("2d"));
  expect(screen.queryByRole("button", { name: "Extension action" })).not.toBeInTheDocument();
  expect(registry.panels("2d")).toEqual([]);
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
      <GameEditorShell dimension="2d" registry={registry} toolbar={toolbar} status={status}
        panels={[
          { id: "first", visible, node: <span>Optional panel</span> },
          { id: "viewport", node: <input aria-label="Viewport focus" /> }
        ]} />
    </ThemeProvider>
  );
  const rendered = render(view(true));
  const input = screen.getByRole("textbox", { name: "Viewport focus" });
  await user.click(input);
  rendered.rerender(view(false));
  expect(screen.getByRole("textbox", { name: "Viewport focus" })).toBe(input);
  expect(input).toHaveFocus();
});

it("routes editor keys once and preserves editable, handled and gameplay input", async () => {
  const user = userEvent.setup();
  const registry = createGamePanelRegistry();
  registry.register({ id: "viewport", title: "Viewport", icon: null, dimensions: ["2d"], defaultRegion: "viewport" });
  const undo = jest.fn();
  const view = (playSession: boolean) => <ThemeProvider theme={mockTheme}>
    <GameEditorShell dimension="2d" registry={registry} toolbar={{ ...toolbar, playSession }} status={status}
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
  rendered.rerender(view(true));
  await user.click(screen.getByRole("button", { name: "Editor canvas" }));
  await user.keyboard("{Control>}z{/Control}");
  expect(undo).toHaveBeenCalledTimes(1);
});

it("keeps unscoped inspector controls outside editor shortcut routing", async () => {
  const user = userEvent.setup();
  const registry = createGamePanelRegistry();
  registry.register({ id: "inspector", title: "Inspector", icon: null, dimensions: ["2d"], defaultRegion: "right" });
  const onKeyDown = jest.fn();
  render(<ThemeProvider theme={mockTheme}><GameEditorShell dimension="2d" registry={registry} toolbar={toolbar}
    status={status} onKeyDown={onKeyDown} panels={[{ id: "inspector", node: <button>Inspector action</button> }]} /></ThemeProvider>);
  await user.click(screen.getByRole("button", { name: "Inspector action" }));
  await user.keyboard("{Control>}z{/Control}{Delete}");
  expect(onKeyDown).not.toHaveBeenCalled();
});
