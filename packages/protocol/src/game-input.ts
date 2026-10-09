import { z } from "zod";

/** A `KeyboardEvent.code` value such as `KeyW`, `ArrowLeft` or `Space`. */
const keyCode = z.string().min(1).max(32);
const gamepadButton = z.number().int().min(0).max(31);
const gamepadAxis = z.number().int().min(0).max(15);
const deadZone = z.number().finite().min(0).max(0.95);
const stickDirection = z.enum(["left", "right", "up", "down"]);

/** One physical control that holds an action. */
export const gameInputBinding = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("key"), code: keyCode }),
  z.strictObject({ kind: z.literal("mouseButton"), button: z.number().int().min(0).max(4) }),
  z.strictObject({ kind: z.literal("gamepadButton"), button: gamepadButton }),
  z.strictObject({ kind: z.literal("gamepadAxis"), axis: gamepadAxis, direction: z.enum(["negative", "positive"]),
    threshold: z.number().finite().min(0.05).max(1).default(0.5) }),
  z.strictObject({ kind: z.literal("touchButton"), label: z.string().min(1).max(16).optional() }),
  z.strictObject({ kind: z.literal("touchStick"), direction: stickDirection })
]);

export type GameInputBinding = z.infer<typeof gameInputBinding>;

/** One physical source of an analog axis value in [-1, 1]. */
export const gameInputAxisBinding = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("keys"), negative: z.array(keyCode).max(4), positive: z.array(keyCode).max(4) }),
  z.strictObject({ kind: z.literal("gamepadAxis"), axis: gamepadAxis, deadZone: deadZone.default(0.15), invert: z.boolean().default(false) }),
  z.strictObject({ kind: z.literal("gamepadButtons"), negative: gamepadButton, positive: gamepadButton }),
  z.strictObject({ kind: z.literal("touchStick"), axis: z.enum(["x", "y"]), invert: z.boolean().default(false) })
]);

export type GameInputAxisBinding = z.infer<typeof gameInputAxisBinding>;

/** One source of 3D camera look, in mouse-pixel units per tick. */
export const gameLookBinding = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("mouse"), sensitivity: z.number().finite().min(0.01).max(100).default(1), invertY: z.boolean().default(false) }),
  z.strictObject({ kind: z.literal("gamepadStick"), xAxis: gamepadAxis.default(2), yAxis: gamepadAxis.default(3), deadZone: deadZone.default(0.15),
    speed: z.number().finite().min(0.1).max(200).default(10), invertY: z.boolean().default(false) }),
  z.strictObject({ kind: z.literal("touchDrag"), sensitivity: z.number().finite().min(0.01).max(100).default(1), invertY: z.boolean().default(false) })
]);

export type GameLookBinding = z.infer<typeof gameLookBinding>;

/**
 * Document-level input map. An action or axis listed here uses exactly these bindings; one that is
 * absent keeps the defaults generated from its name. Bindings change only how physical input becomes
 * an input frame, so they never enter the simulation.
 */
export const gameInputBindings = z.strictObject({
  actions: z.record(z.string().min(1), z.array(gameInputBinding).max(16)).default({}),
  axes: z.record(z.string().min(1), z.array(gameInputAxisBinding).max(8)).default({}),
  look: z.array(gameLookBinding).max(4).optional()
});

export type GameInputBindings = z.infer<typeof gameInputBindings>;

export interface ResolvedGameInputBindings {
  readonly actions: readonly { readonly action: string; readonly bindings: readonly GameInputBinding[] }[];
  readonly axes: readonly { readonly axis: string; readonly bindings: readonly GameInputAxisBinding[] }[];
  readonly look: readonly GameLookBinding[];
}

interface InputBindingSource {
  readonly dimension?: "3d";
  readonly inputActions: readonly string[];
  readonly inputAxes?: readonly string[];
  readonly inputBindings?: GameInputBindings;
}

/** The 2D naming rule: arrows and WASD are directions, Space is `space`, any other key is its lowercase key value. */
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

// US-layout key value for each code, so the 2D naming rule can be inverted into code bindings.
const US_KEYS: readonly (readonly [string, string])[] = [
  ...Array.from({ length: 26 }, (_, index) => { const letter = String.fromCharCode(97 + index); return [`Key${letter.toUpperCase()}`, letter] as const; }),
  ...Array.from({ length: 10 }, (_, digit) => [`Digit${digit}`, String(digit)] as const),
  ...Array.from({ length: 12 }, (_, index) => [`F${index + 1}`, `F${index + 1}`] as const),
  ["ArrowLeft", "ArrowLeft"], ["ArrowRight", "ArrowRight"], ["ArrowUp", "ArrowUp"], ["ArrowDown", "ArrowDown"], ["Space", " "],
  ["Enter", "Enter"], ["NumpadEnter", "Enter"], ["Escape", "Escape"], ["Tab", "Tab"], ["Backspace", "Backspace"], ["Delete", "Delete"],
  ["Insert", "Insert"], ["Home", "Home"], ["End", "End"], ["PageUp", "PageUp"], ["PageDown", "PageDown"], ["CapsLock", "CapsLock"],
  ["ShiftLeft", "Shift"], ["ShiftRight", "Shift"], ["ControlLeft", "Control"], ["ControlRight", "Control"],
  ["AltLeft", "Alt"], ["AltRight", "Alt"], ["MetaLeft", "Meta"], ["MetaRight", "Meta"],
  ["Minus", "-"], ["Equal", "="], ["BracketLeft", "["], ["BracketRight", "]"], ["Backslash", "\\"], ["Semicolon", ";"],
  ["Quote", "'"], ["Comma", ","], ["Period", "."], ["Slash", "/"], ["Backquote", "`"]
];

const DIRECTION_GAMEPAD: Readonly<Record<string, { readonly button: number; readonly axis: number; readonly direction: "negative" | "positive" }>> = {
  left: { button: 14, axis: 0, direction: "negative" }, right: { button: 15, axis: 0, direction: "positive" },
  up: { button: 12, axis: 1, direction: "negative" }, down: { button: 13, axis: 1, direction: "positive" }
};
// Standard gamepad layout: 0 is the bottom face button, 7 the right trigger, 8 Back and 9 Start.
const ACTION_GAMEPAD_BUTTON: Readonly<Record<string, number>> = { jump: 0, space: 0, fire: 7, respawn: 8, start: 9, pause: 9 };

function key(code: string): GameInputBinding { return { kind: "key", code }; }

function defaultActionBindings(action: string, threeD: boolean): GameInputBinding[] {
  const bindings: GameInputBinding[] = [];
  if (threeD) {
    // The 3D naming rule: fire is the left mouse button and F, jump is Space, respawn is R, other actions are Key<ACTION> or the action as a code.
    if (action === "fire") { bindings.push({ kind: "mouseButton", button: 0 }, key("KeyF")); }
    else if (action === "jump") { bindings.push(key("Space")); }
    else if (action === "respawn") { bindings.push(key("KeyR")); }
    else { bindings.push(key(`Key${action.toUpperCase()}`), key(action)); }
  } else {
    for (const [code, value] of US_KEYS) {
      if (gameKeyAction(code, value) === action) { bindings.push(key(code)); }
    }
  }
  const direction = DIRECTION_GAMEPAD[action];
  if (direction && !threeD) {
    bindings.push({ kind: "gamepadButton", button: direction.button },
      { kind: "gamepadAxis", axis: direction.axis, direction: direction.direction, threshold: 0.5 },
      { kind: "touchStick", direction: action as z.infer<typeof stickDirection> });
    return bindings;
  }
  const button = ACTION_GAMEPAD_BUTTON[action];
  if (button !== undefined) { bindings.push({ kind: "gamepadButton", button }); }
  bindings.push({ kind: "touchButton" });
  return bindings;
}

function defaultAxisBindings(axis: string): GameInputAxisBinding[] {
  if (axis === "moveX") {
    return [{ kind: "keys", negative: ["KeyA", "ArrowLeft"], positive: ["KeyD", "ArrowRight"] },
      { kind: "gamepadAxis", axis: 0, deadZone: 0.15, invert: false }, { kind: "gamepadButtons", negative: 14, positive: 15 },
      { kind: "touchStick", axis: "x", invert: false }];
  }
  if (axis === "moveZ") {
    return [{ kind: "keys", negative: ["KeyW", "ArrowUp"], positive: ["KeyS", "ArrowDown"] },
      { kind: "gamepadAxis", axis: 1, deadZone: 0.15, invert: false }, { kind: "gamepadButtons", negative: 12, positive: 13 },
      { kind: "touchStick", axis: "y", invert: false }];
  }
  return [];
}

const DEFAULT_LOOK: readonly GameLookBinding[] = [
  { kind: "mouse", sensitivity: 1, invertY: false },
  { kind: "gamepadStick", xAxis: 2, yAxis: 3, deadZone: 0.15, speed: 10, invertY: false },
  { kind: "touchDrag", sensitivity: 1, invertY: false }
];

/**
 * The effective input map of a document: authored bindings where present, otherwise defaults generated
 * from the action and axis names. Keyboard and mouse defaults reproduce the earlier fixed mapping, so a
 * document without `inputBindings` produces the same input frames as before.
 */
export function resolveGameInputBindings(document: InputBindingSource): ResolvedGameInputBindings {
  const threeD = document.dimension === "3d";
  const authored = document.inputBindings;
  return {
    actions: document.inputActions.map((action) => ({ action, bindings: authored?.actions[action] ?? defaultActionBindings(action, threeD) })),
    axes: threeD ? (document.inputAxes ?? []).map((axis) => ({ axis, bindings: authored?.axes[axis] ?? defaultAxisBindings(axis) })) : [],
    look: threeD ? authored?.look ?? DEFAULT_LOOK : []
  };
}

export interface GameInputBindingIssue {
  readonly path: (string | number)[];
  readonly message: string;
}

/** Reference checks for `inputBindings`: every bound action and axis must be declared. 2D documents have no axes or look. */
export function gameInputBindingIssues(document: InputBindingSource): GameInputBindingIssue[] {
  const bindings = document.inputBindings;
  if (!bindings) { return []; }
  const issues: GameInputBindingIssue[] = [];
  for (const action of Object.keys(bindings.actions)) {
    if (!document.inputActions.includes(action)) { issues.push({ path: ["inputBindings", "actions", action], message: `Input action ${action} is not declared` }); }
  }
  for (const axis of Object.keys(bindings.axes)) {
    if (document.dimension !== "3d") { issues.push({ path: ["inputBindings", "axes", axis], message: "2D games have no input axes" }); }
    else if (!(document.inputAxes ?? []).includes(axis)) { issues.push({ path: ["inputBindings", "axes", axis], message: `Input axis ${axis} is not declared` }); }
  }
  if (bindings.look && document.dimension !== "3d") { issues.push({ path: ["inputBindings", "look"], message: "2D games have no camera look" }); }
  return issues;
}
