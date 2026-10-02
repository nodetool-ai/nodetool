import type { GameDocument3D, GameInputFrame3D } from "@nodetool-ai/protocol";

const MOVEMENT_KEYS_3D = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"]);
function actionKeys3D(action: string): readonly string[] {
  if (action === "fire") { return ["Mouse0", "KeyF"]; }
  return action === "jump" ? ["Space"] : action === "respawn" ? ["KeyR"] : [`Key${action.toUpperCase()}`, action];
}

/** Physical input is sampled once per simulation tick and released on focus loss. */
export class GameInput3D {
  private readonly keys = new Set<string>();
  private readonly newlyPressed = new Set<string>();
  private lookX = 0;
  private lookY = 0;

  keyDown(code: string): void {
    if (!this.keys.has(code)) { this.newlyPressed.add(code); }
    this.keys.add(code);
  }

  keyUp(code: string): void { this.keys.delete(code); }

  handlesKey(document: GameDocument3D, code: string): boolean {
    return MOVEMENT_KEYS_3D.has(code) || document.inputActions.some((action) => actionKeys3D(action).includes(code));
  }

  look(x: number, y: number): void {
    this.lookX += x;
    this.lookY += y;
  }

  release(): void {
    this.keys.clear();
    this.newlyPressed.clear();
    this.lookX = 0;
    this.lookY = 0;
  }

  sample(document: GameDocument3D): GameInputFrame3D {
    const actions = (keys: ReadonlySet<string>): string[] => document.inputActions.filter((action) =>
      actionKeys3D(action).some((code) => keys.has(code)));
    const x = Number(this.keys.has("KeyD") || this.keys.has("ArrowRight")) - Number(this.keys.has("KeyA") || this.keys.has("ArrowLeft"));
    const z = Number(this.keys.has("KeyS") || this.keys.has("ArrowDown")) - Number(this.keys.has("KeyW") || this.keys.has("ArrowUp"));
    const input: GameInputFrame3D = { pressed: actions(this.keys), justPressed: actions(this.newlyPressed),
      axes: Object.fromEntries(document.inputAxes.map((axis) => [axis, axis === "moveX" ? x : axis === "moveZ" ? z : 0])),
      look: { x: this.lookX, y: this.lookY } };
    this.newlyPressed.clear();
    this.lookX = 0;
    this.lookY = 0;
    return input;
  }
}
