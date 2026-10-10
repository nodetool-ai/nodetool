import { act, render, renderHook, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../../../__mocks__/themeMock";
import { getGameConsoleStore } from "../../../../../stores/game/GameConsoleStore";
import { getGameDraftStore } from "../../../../../stores/game/GameDraftStore";
import GameConsolePanel from "../GameConsolePanel";
import { useGameConsoleFeed } from "../useGameConsoleFeed";

const document = { scenes: [
  { id: "intro", entities: [{ id: "player", name: "Hero" }] },
  { id: "level-1", entities: [{ id: "door", name: "Door" }] }
] };

let gameSequence = 0;
function nextGameId(): string {
  gameSequence += 1;
  return `console-game-${gameSequence}`;
}

function renderPanel(gameId: string, overrides: Partial<Parameters<typeof GameConsolePanel>[0]> = {}) {
  const onSelectEntity = jest.fn();
  const onAskAssistant = jest.fn();
  render(<ThemeProvider theme={mockTheme}>
    <GameConsolePanel gameId={gameId} document={document} onSelectEntity={onSelectEntity} onAskAssistant={onAskAssistant} {...overrides} />
  </ThemeProvider>);
  return { onSelectEntity, onAskAssistant };
}

function lines(): HTMLElement[] {
  return within(screen.getByRole("list", { name: "Console lines" })).getAllByRole("listitem");
}

it("collapses repeated lines and shows the tick range and repeat count", () => {
  const gameId = nextGameId();
  const store = getGameConsoleStore(gameId);
  for (const tick of [4, 5, 6]) {
    store.getState().append({ level: "log", source: "script", message: "jump", entityId: "player", tick });
  }
  renderPanel(gameId);
  expect(lines()).toHaveLength(1);
  expect(lines()[0]).toHaveTextContent("Ticks 4–6");
  expect(within(lines()[0]).getByLabelText("Repeated 3 times")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Logs 3" })).toBeInTheDocument();
});

it("filters by level and by text, including the entity's name", async () => {
  const user = userEvent.setup();
  const gameId = nextGameId();
  const store = getGameConsoleStore(gameId);
  store.getState().append({ level: "error", source: "script", message: "Game script failed", entityId: "player", tick: 2 });
  store.getState().append({ level: "log", source: "script", message: "opened", entityId: "door", tick: 3 });
  renderPanel(gameId, { liveEntries: [{ level: "warning", source: "runtime", message: "Missing camera", sceneId: "intro" }] });
  expect(lines()).toHaveLength(3);

  await user.click(screen.getByRole("button", { name: "Logs 1" }));
  expect(screen.getByRole("button", { name: "Logs 1" })).toHaveAttribute("aria-pressed", "false");
  expect(lines().map((line) => line.dataset.level)).toEqual(["warning", "error"]);

  await user.click(screen.getByRole("button", { name: "Warnings 1" }));
  expect(lines().map((line) => line.dataset.level)).toEqual(["error"]);

  await user.click(screen.getByRole("button", { name: "Logs 1" }));
  await user.type(screen.getByLabelText("Filter console"), "door");
  expect(lines()).toHaveLength(1);
  expect(lines()[0]).toHaveTextContent("opened");

  await user.clear(screen.getByLabelText("Filter console"));
  await user.type(screen.getByLabelText("Filter console"), "hero");
  expect(lines()).toHaveLength(1);
  expect(lines()[0]).toHaveTextContent("Game script failed");

  await user.type(screen.getByLabelText("Filter console"), " nothing");
  expect(screen.getByText("No lines match the filters")).toBeInTheDocument();
});

it("keeps the console live region mounted while empty so the first line is announced", () => {
  const gameId = nextGameId();
  renderPanel(gameId);
  const region = screen.getByRole("log", { name: "Console" });
  expect(region).toHaveTextContent("No console output");
  act(() => { getGameConsoleStore(gameId).getState().append({ level: "error", source: "runtime", message: "first", tick: 1 }); });
  expect(screen.getByRole("log", { name: "Console" })).toBe(region);
  expect(within(region).getByRole("list", { name: "Console lines" })).toHaveTextContent("first");
});

it("selects the linked entity in the scene that holds it and leaves deleted entities unlinked", async () => {
  const user = userEvent.setup();
  const gameId = nextGameId();
  const store = getGameConsoleStore(gameId);
  store.getState().append({ level: "error", source: "script", message: "door broke", entityId: "door", tick: 7 });
  store.getState().append({ level: "error", source: "script", message: "ghost broke", entityId: "ghost", tick: 8 });
  const { onSelectEntity } = renderPanel(gameId);
  await user.click(screen.getByRole("button", { name: "Select Door" }));
  expect(onSelectEntity).toHaveBeenCalledWith("level-1", "door");
  expect(within(lines()[1]).queryByRole("button", { name: /Select/ })).not.toBeInTheDocument();
  expect(lines()[1]).toHaveTextContent("ghost");
});

it("hands a line to the assistant draft", async () => {
  const user = userEvent.setup();
  const gameId = nextGameId();
  getGameConsoleStore(gameId).getState().append({ level: "error", source: "script", message: "boom", entityId: "player", tick: 12 });
  const { onAskAssistant } = renderPanel(gameId);
  const ask = within(lines()[0]).getByRole("button", { name: "Ask the assistant" });
  expect(ask).toHaveAccessibleDescription("boom");
  await user.click(ask);
  expect(onAskAssistant).toHaveBeenCalledWith("Help with this game console error. Entity: Hero (player). Tick: 12. Message: boom");
});

it("clears stored lines but keeps live validation lines", async () => {
  const user = userEvent.setup();
  const gameId = nextGameId();
  getGameConsoleStore(gameId).getState().append({ level: "log", source: "script", message: "old", tick: 1 });
  renderPanel(gameId, { liveEntries: [{ level: "error", source: "validation", message: "Missing camera" }] });
  await user.click(screen.getByRole("button", { name: "Clear" }));
  expect(lines()).toHaveLength(1);
  expect(lines()[0]).toHaveTextContent("Missing camera");
  expect(screen.getByRole("button", { name: "Clear" })).toBeDisabled();
});

describe("useGameConsoleFeed", () => {
  it("writes each new error once, collapses a recurrence and does not repeat the script error as a runtime error", () => {
    const gameId = nextGameId();
    const failure = { message: "Game script [\"intro\",\"player\",0] threw", tick: 5, entityId: "player" };
    const initialProps: Parameters<typeof useGameConsoleFeed>[1] = { runtimeError: failure.message, scriptError: failure, diagnosticError: null, tick: 4 };
    const { rerender } = renderHook((props: Parameters<typeof useGameConsoleFeed>[1]) => useGameConsoleFeed(gameId, props), { initialProps });
    rerender({ runtimeError: failure.message, scriptError: { ...failure }, diagnosticError: null, tick: 4 });
    expect(getGameConsoleStore(gameId).getState().groups).toEqual([
      { id: 1, level: "error", source: "script", message: failure.message, entityId: "player", tick: 5, firstTick: 5, count: 1 }
    ]);
    rerender({ runtimeError: null, scriptError: null, diagnosticError: null, tick: 0 });
    rerender({ runtimeError: failure.message, scriptError: { ...failure, tick: 9 }, diagnosticError: null, tick: 8 });
    expect(getGameConsoleStore(gameId).getState().groups).toMatchObject([{ count: 2, firstTick: 5, tick: 9 }]);
    rerender({ runtimeError: "WebGPU device lost", scriptError: null, diagnosticError: null, tick: 30 });
    expect(getGameConsoleStore(gameId).getState().groups.at(-1)).toMatchObject({ source: "runtime", message: "WebGPU device lost", tick: 30 });
  });

  it("does not repeat a script failure as a runtime line after Stop or Load clears only the script failure", () => {
    const gameId = nextGameId();
    const failure = { message: "Game script [\"intro\",\"player\",0] threw", tick: 5, entityId: "player" };
    const initialProps: Parameters<typeof useGameConsoleFeed>[1] = { runtimeError: failure.message, scriptError: failure, diagnosticError: null, tick: 4 };
    const { rerender } = renderHook((props: Parameters<typeof useGameConsoleFeed>[1]) => useGameConsoleFeed(gameId, props), { initialProps });
    rerender({ runtimeError: failure.message, scriptError: null, diagnosticError: null, tick: 4 });
    expect(getGameConsoleStore(gameId).getState().groups).toEqual([
      { id: 1, level: "error", source: "script", message: failure.message, entityId: "player", tick: 5, firstTick: 5, count: 1 }
    ]);
  });

  it("keeps console lines out of the draft document and its undo history", () => {
    const gameId = nextGameId();
    const draft = getGameDraftStore(gameId).getState();
    const before = { document: draft.document, pendingOps: draft.pendingOps, canUndo: draft.canUndo };
    act(() => { getGameConsoleStore(gameId).getState().append({ level: "log", source: "script", message: "hello", tick: 1 }); });
    const after = getGameDraftStore(gameId).getState();
    expect({ document: after.document, pendingOps: after.pendingOps, canUndo: after.canUndo }).toEqual(before);
    expect(after.document).toBe(before.document);
  });
});
