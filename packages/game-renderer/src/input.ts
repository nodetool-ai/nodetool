/** Map a physical key to the action name used by native game documents. */
export function gameKeyAction(code: string, key: string): string {
  switch (code) {
    case "ArrowLeft": case "KeyA": return "left";
    case "ArrowRight": case "KeyD": return "right";
    case "ArrowUp": case "KeyW": return "up";
    case "ArrowDown": case "KeyS": return "down";
    case "Space": return "space";
    default: return key.toLowerCase();
  }
}
