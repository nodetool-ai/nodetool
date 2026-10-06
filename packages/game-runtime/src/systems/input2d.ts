import type { GameSystemContext2D } from "./context2d.js";
export function stepInput2D(context: GameSystemContext2D): void {
  for (const action of context.input.pressed) {
    context.pressed.add(action);
  }
}
