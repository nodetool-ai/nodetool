import type { GameDocument, GameInputFrame } from "@nodetool-ai/protocol/game.js";
import { gameKeyAction } from "@nodetool-ai/game-renderer";

export function pressGameKey(keys: Map<string, string>, newlyPressed: Set<string>, code: string, key: string,
  actions: readonly string[]): boolean {
  const action = gameKeyAction(code, key);
  if (!actions.includes(action)) return false;
  if (!keys.has(code)) newlyPressed.add(code);
  keys.set(code, action);
  return true;
}

export function gameInputFrame(keys: ReadonlyMap<string, string>, newlyPressed: ReadonlySet<string>,
  document: GameDocument): GameInputFrame {
  const pressed = [...new Set(keys.values())];
  const justPressed = [...new Set([...newlyPressed].map((code) => keys.get(code)).filter((action): action is string => Boolean(action)))];
  return {
    pressed: pressed.filter((action) => document.inputActions.includes(action)),
    justPressed: justPressed.filter((action) => document.inputActions.includes(action))
  };
}
