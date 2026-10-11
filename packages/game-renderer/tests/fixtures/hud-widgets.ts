import { gameDocument, type GameDocument, type GameUiTree } from "@nodetool-ai/protocol";

/** Health bar, score panel and pause button: the HUD widget acceptance fixture. */
export const HUD_WIDGETS: GameUiTree = {
  nodes: [
    { kind: "stack", id: "status", offset: { x: 16, y: 16 }, gap: 6 },
    { kind: "text", id: "healthLabel", parent: "status", text: "HP", size: 14, color: "#e8f0ff" },
    { kind: "bar", id: "health", parent: "status", width: 180, height: 14, source: { kind: "health", entityId: "player" },
      color: "#e04848", background: "#301818" },
    { kind: "panel", id: "scorePanel", anchor: { x: 1, y: 0 }, offset: { x: -16, y: 16 }, width: 140, height: 40, color: "#14325a", cornerRadius: 6 },
    { kind: "text", id: "score", parent: "scorePanel", anchor: { x: 0.5, y: 0.5 }, text: "Score 0", size: 18 },
    { kind: "button", id: "pause", anchor: { x: 0.5, y: 1 }, offset: { x: 0, y: -16 }, width: 112, height: 40, action: "pause",
      text: "Pause", background: "#3a8a3a" }
  ]
};

/** A 2D game with a 512 by 288 HUD. Its script counts score and toggles the pause button label when pause is pressed. */
export function hudWidgetsGame2D(): GameDocument {
  return gameDocument.parse({
    schemaVersion: 2, engineVersion: "1", id: "hud-widgets", revision: "r1", entrySceneId: "main",
    pixelsPerUnit: 32, tickRate: 60, inputActions: ["pause"],
    assets: {},
    ui: HUD_WIDGETS,
    scenes: [{ id: "main", name: "Main", entities: [
      { id: "camera", transform2d: { x: 0, y: 0 }, camera2d: { width: 16, height: 9 } },
      { id: "player", transform2d: { x: 0, y: 0 }, behaviors: [{ kind: "health", maximum: 4 },
        { kind: "script", maxTickMs: 50, source: "({ tick, justPressed, state }) => { const paused = (state ?? false) !== justPressed.includes('pause'); return { state: paused, commands: [{ kind: 'ui', id: 'score', text: 'Score ' + (tick + 1) * 10 }, { kind: 'ui', id: 'pause', text: paused ? 'Resume' : 'Pause' }] }; }" }] }
    ] }]
  });
}
