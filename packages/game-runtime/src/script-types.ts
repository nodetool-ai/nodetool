/** Monaco declarations for the native game function-expression contract. */
export const GAME_SCRIPT_TYPES = `
type GameScriptCommand =
  | { kind: "setVelocity"; x: number; y: number }
  | { kind: "setPosition"; x: number; y: number }
  | { kind: "setVisual"; tint?: string; opacity?: number; rotation?: number; scaleX?: number; scaleY?: number }
  | { kind: "hud"; id: string; text: string; x: number; y: number; size?: number; color?: string; align?: "left" | "center" | "right"; fontId?: string }
  | { kind: "emit"; event: string }
  | { kind: "spawn"; prefabId: string; x?: number; y?: number; velocityX?: number; velocityY?: number }
  | { kind: "despawn"; entityId: string }
  | { kind: "sceneTransition"; sceneId: string };

type GameScriptInput = {
  tick: number;
  pressed: readonly string[];
  justPressed: readonly string[];
  events: readonly unknown[];
  entity: { id: string; x: number; y: number; velocityX: number; velocityY: number };
  world: readonly { id: string; source: string; x: number; y: number }[];
  state: unknown;
  random: () => number;
};

type GameScriptResult = { state: unknown; commands: GameScriptCommand[] };
type GameScript = (input: GameScriptInput) => GameScriptResult;
`;
