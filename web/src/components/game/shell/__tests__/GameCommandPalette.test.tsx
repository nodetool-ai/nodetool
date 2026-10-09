import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { useState, type ComponentProps } from "react";

import mockTheme from "../../../../__mocks__/themeMock";
import GameEditorShell from "../GameEditorShell";
import { createGamePanelRegistry } from "../panelRegistry";
import { createGamePanelLayoutStore } from "../../../../stores/game/GamePanelLayoutStore";
import { getGameShortcutStore } from "../../../../stores/game/GameShortcutStore";
import useAuth from "../../../../stores/useAuth";

const memory = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };

function Shell(props: Omit<ComponentProps<typeof GameEditorShell>, "layoutStore" | "registry" | "status" | "panels">) {
  const [store] = useState(() => createGamePanelLayoutStore({ anonymous: true }, memory));
  const [registry] = useState(() => {
    const result = createGamePanelRegistry();
    result.register({ id: "viewport", title: "Viewport", icon: null, dimensions: ["2d", "3d"], defaultRegion: "viewport" });
    return result;
  });
  return <ThemeProvider theme={mockTheme}><GameEditorShell {...props} layoutStore={store} registry={registry}
    status={{ tick: 0, score: 0, won: false, backend: "Test" }}
    panels={[{ id: "viewport", keyboardScope: true, node: <button>Editor canvas</button> }]} /></ThemeProvider>;
}

function toolbar(playSession = false): ComponentProps<typeof GameEditorShell>["toolbar"] {
  return { name: "Palette game", playing: false, playSession, loading: false, saving: false, saveStatus: "saved",
    assistantOpen: false, sceneTreeOpen: true, inspectorOpen: true, playHref: "/game/palette",
    onPlay: jest.fn(), onStop: jest.fn(), onStep: jest.fn(), onSave: jest.fn(), onLoad: jest.fn(), onPublish: jest.fn(),
    onAssistant: jest.fn(), onSceneTree: jest.fn(), onInspector: jest.fn() };
}

const shortcuts = () => getGameShortcutStore(useAuth.getState().user?.id ?? null);
beforeEach(() => { shortcuts().getState().resetAll(); });

it.each(["2d", "3d"] as const)("opens the %s palette with Ctrl+K, filters commands and runs the highlighted one", async (dimension) => {
  const user = userEvent.setup();
  const redo = jest.fn();
  render(<Shell dimension={dimension} toolbar={toolbar()} commands={{ "edit.undo": { run: jest.fn() }, "edit.redo": { run: redo } }} />);
  await user.click(screen.getByRole("button", { name: "Editor canvas" }));
  await user.keyboard("{Control>}k{/Control}");
  const palette = await screen.findByRole("dialog", { name: /^Commands/ });
  expect(within(palette).getByRole("button", { name: /Undo/ })).toBeInTheDocument();
  await user.keyboard("redo");
  expect(within(palette).queryByRole("button", { name: /Undo/ })).not.toBeInTheDocument();
  await user.keyboard("{Enter}");
  expect(redo).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(screen.queryByRole("dialog", { name: /^Commands/ })).not.toBeInTheDocument());
});

it("lists assistant actions, hides disabled commands and keeps only play-safe commands during play", async () => {
  const user = userEvent.setup();
  const playtest = jest.fn();
  const commands = {
    "edit.undo": { run: jest.fn() },
    "assistant.playtest": { run: playtest },
    "assistant.fixScriptError": { run: jest.fn(), enabled: false }
  };
  const view = (playSession: boolean) => <Shell dimension="3d" toolbar={toolbar(playSession)} commands={commands} />;
  const rendered = render(view(false));
  await user.click(screen.getByRole("button", { name: "Commands" }));
  let palette = await screen.findByRole("dialog", { name: /^Commands/ });
  expect(within(palette).queryByRole("button", { name: /fix the script error/ })).not.toBeInTheDocument();
  expect(within(palette).queryByRole("button", { name: /Step one tick/ })).not.toBeInTheDocument();
  await user.click(within(palette).getByRole("button", { name: /Ask the assistant to playtest the game/ }));
  expect(playtest).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(screen.queryByRole("dialog", { name: /^Commands/ })).not.toBeInTheDocument());
  await act(async () => rendered.rerender(view(true)));
  await user.click(screen.getByRole("button", { name: "Commands" }));
  palette = await screen.findByRole("dialog", { name: /^Commands/ });
  expect(within(palette).queryByRole("button", { name: /Undo/ })).not.toBeInTheDocument();
  expect(within(palette).getByRole("button", { name: /Step one tick/ })).toBeInTheDocument();
  expect(within(palette).getByRole("button", { name: /Ask the assistant to playtest/ })).toBeInTheDocument();
});

it("rebinds a command from the shortcut editor, rejects conflicts and resets it", async () => {
  const user = userEvent.setup();
  const undo = jest.fn();
  render(<Shell dimension="2d" toolbar={toolbar()} commands={{ "edit.undo": { run: undo } }} />);
  await user.click(screen.getByRole("button", { name: "Editor canvas" }));
  await user.keyboard("{Control>}k{/Control}");
  await user.keyboard("keyboard shortcuts{Enter}");
  const editor = await screen.findByRole("dialog", { name: /^Keyboard shortcuts/ });
  await user.click(within(editor).getByRole("button", { name: "Change shortcut for Undo" }));
  await user.keyboard("{Control>}k{/Control}");
  expect(within(editor).getByRole("alert")).toHaveTextContent("Open command palette already uses this shortcut");
  await user.click(within(editor).getByRole("button", { name: "Change shortcut for Undo" }));
  await user.keyboard("{Control>}u{/Control}");
  expect(shortcuts().getState().overrides["edit.undo"]).toEqual([{ code: "KeyU", mod: true }]);
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog", { name: /^Keyboard shortcuts/ })).not.toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: "Editor canvas" }));
  await user.keyboard("{Control>}z{/Control}");
  expect(undo).not.toHaveBeenCalled();
  await user.keyboard("{Control>}u{/Control}");
  expect(undo).toHaveBeenCalledTimes(1);
  act(() => shortcuts().getState().resetBindings("edit.undo"));
  await user.keyboard("{Control>}z{/Control}");
  expect(undo).toHaveBeenCalledTimes(2);
});
