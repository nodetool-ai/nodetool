import { createGamePanelLayout, GAME_LAYOUT_PRESETS, gameDockLayoutModel } from "../GamePanelLayout";
import { createGamePanelLayoutStore } from "../GamePanelLayoutStore";

it("keeps the game's presets, required viewport and persistence key", () => {
  expect(GAME_LAYOUT_PRESETS).toEqual(["Default", "Scripting", "Animation", "Wide"]);
  expect(gameDockLayoutModel.requiredPanels).toEqual(["viewport"]);
  expect(gameDockLayoutModel.editorLabel).toBe("game");
  expect(createGamePanelLayout("Wide").hidden).toEqual(["hierarchy", "revisions", "inspector", "assistant", "scripts"]);
  expect(createGamePanelLayout("Scripting").sizes.bottom).toBe(360);
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); } };
  createGamePanelLayoutStore({ anonymous: true }, storage).getState().dispatch({ type: "resize", region: "left", size: 300 });
  createGamePanelLayoutStore({ userId: "u 1" }, storage).getState().dispatch({ type: "resize", region: "left", size: 300 });
  expect([...data.keys()]).toEqual(["nodetool.game-layout.v1:anonymous", "nodetool.game-layout.v1:user:u%201"]);
});

it("refuses to hide the viewport", () => {
  const layout = createGamePanelLayout();
  expect(gameDockLayoutModel.transition(layout, { type: "hide", panelId: "viewport" })).toBe(layout);
});
