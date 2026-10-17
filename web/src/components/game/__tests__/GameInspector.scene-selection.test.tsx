import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { createTopDownRoomGame, validateGame, type GameDocumentOp } from "@nodetool-ai/game-runtime";
import mockTheme from "../../../__mocks__/themeMock";
import GameInspector from "../panels/inspector/GameInspector";

it("reads and edits the selected scene's entity when another scene has the same local ID (E1)", () => {
  const document = createTopDownRoomGame("inspector-scene-selection");
  const first = document.scenes[0];
  const player = first.entities.find((entity) => entity.id === "player");
  if (!player) { throw new Error("Inspector fixture player is missing"); }
  player.name = "Player A";
  const second = structuredClone(first);
  second.id = "scene-b";
  second.name = "Scene B";
  const other = second.entities.find((entity) => entity.id === "player");
  if (!other) { throw new Error("Second scene fixture player is missing"); }
  other.name = "Player B";
  document.scenes.push(second);
  expect(validateGame(document).valid).toBe(true);
  const onOps = jest.fn<void, [GameDocumentOp[]]>();
  render(<ThemeProvider theme={mockTheme}>
    <GameInspector document={document} activeSceneId="scene-b" selectedIds={["player"]}
      onOps={onOps} onSceneChange={() => undefined} onEditScript={() => undefined} />
  </ThemeProvider>);
  const name = screen.getByRole("textbox", { name: "Name" });
  expect(name).toHaveValue("Player B");
  fireEvent.change(name, { target: { value: "Edited B" } });
  expect(onOps).toHaveBeenLastCalledWith([{ op: "update_entity", scene_id: "scene-b", entity_id: "player", set: { name: "Edited B" } }]);
});


it("opens the selected scene's script rather than the first same-ID entity's script (E1)", () => {
  const document = createTopDownRoomGame("inspector-script-scene-selection");
  const first = document.scenes[0];
  const player = first.entities.find((entity) => entity.id === "player");
  if (!player) { throw new Error("Inspector fixture player is missing"); }
  player.name = "Player A";
  player.behaviors = [{ kind: "script", source: "input => ({state: 1})", maxCommands: 8, maxTickMs: 8 }];
  const second = structuredClone(first);
  second.id = "scene-b";
  second.name = "Scene B";
  const other = second.entities.find((entity) => entity.id === "player");
  if (!other) { throw new Error("Second scene fixture player is missing"); }
  other.name = "Player B";
  other.behaviors = [{ kind: "script", source: "input => ({state: 2})", maxCommands: 8, maxTickMs: 8 }];
  document.scenes.push(second);
  expect(validateGame(document).valid).toBe(true);
  const onEditScript = jest.fn();
  render(<ThemeProvider theme={mockTheme}>
    <GameInspector document={document} activeSceneId="scene-b" selectedIds={["player"]}
      onOps={() => undefined} onSceneChange={() => undefined} onEditScript={onEditScript} />
  </ThemeProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Edit script" }));
  expect(onEditScript).toHaveBeenCalledWith("scene-b", "player", 0);
});
