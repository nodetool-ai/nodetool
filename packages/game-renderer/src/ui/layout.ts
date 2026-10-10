import type { GameUiFrame, GameUiNode } from "@nodetool-ai/protocol";

/** The HUD rectangle in HUD pixels: the 2D canvas at one pixel per pixel, or the 3D presentation's hudWidth by hudHeight. */
export interface GameUiViewport {
  readonly width: number;
  readonly height: number;
}

/** Device safe-area insets in HUD pixels. */
export interface GameUiInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/** A node placed on the HUD, with the opacity it inherits from its ancestors. */
export interface GameUiBox {
  readonly node: GameUiNode;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly opacity: number;
}

/** Advance width of `text` in HUD pixels at font `size`, in the HUD font for `fontId`. */
export type GameUiMeasureText = (text: string, size: number, fontId: string | undefined) => number;

export const GAME_UI_TEXT_SIZE = 16;
/** Line height of a text node as a multiple of its font size. */
export const GAME_UI_LINE_HEIGHT = 1.25;

const NO_INSETS: GameUiInsets = { top: 0, right: 0, bottom: 0, left: 0 };

interface Size { readonly width: number; readonly height: number }

/**
 * Places every visible node of a HUD tree. The result is in paint order: each node before its children,
 * and siblings in tree order. Hidden nodes and their subtrees are left out.
 * This is the one layout both the 2D HUD pass and the 3D HUD module draw from.
 */
export function layoutGameUi(ui: GameUiFrame, viewport: GameUiViewport, measure: GameUiMeasureText,
  insets: GameUiInsets = NO_INSETS): GameUiBox[] {
  const children = new Map<string | undefined, GameUiNode[]>();
  for (const node of ui.nodes) {
    if (node.visible === false) { continue; }
    const list = children.get(node.parent) ?? [];
    list.push(node);
    children.set(node.parent, list);
  }
  // The document and scene trees merge into one frame, so a container id can repeat. Sizing and placing
  // each id once keeps a repeated id from making a node its own descendant.
  const sizes = new Map<string, Size>();
  const sizing = new Set<string>();
  const placed = new Set<string>();
  const sizeOf = (node: GameUiNode): Size => {
    const known = sizes.get(node.id);
    if (known) { return known; }
    if (sizing.has(node.id)) { return { width: 0, height: 0 }; }
    sizing.add(node.id);
    const content = contentSize(node, children.get(node.id) ?? [], sizeOf, measure);
    const size = { width: node.width ?? content.width, height: node.height ?? content.height };
    sizes.set(node.id, size);
    return size;
  };
  const safe = ui.safeArea ? insets : NO_INSETS;
  const root = { x: safe.left, y: safe.top,
    width: Math.max(0, viewport.width - safe.left - safe.right), height: Math.max(0, viewport.height - safe.top - safe.bottom) };
  const boxes: GameUiBox[] = [];
  const place = (node: GameUiNode, x: number, y: number, inherited: number): void => {
    if (placed.has(node.id)) { return; }
    placed.add(node.id);
    const size = sizeOf(node);
    const box = { node, x: x + (node.offset?.x ?? 0), y: y + (node.offset?.y ?? 0), width: size.width, height: size.height,
      opacity: inherited * (node.opacity ?? 1) };
    boxes.push(box);
    const list = children.get(node.id) ?? [];
    if (node.kind === "stack") { placeStack(node, box, list); }
    else if (node.kind === "grid") { placeGrid(node, box, list); }
    else { for (const child of list) { anchored(child, box, box.opacity); } }
  };
  const anchored = (node: GameUiNode, parent: { x: number; y: number; width: number; height: number }, inherited: number): void => {
    const size = sizeOf(node);
    const anchor = node.anchor ?? { x: 0, y: 0 };
    const pivot = node.pivot ?? anchor;
    place(node, parent.x + anchor.x * parent.width - pivot.x * size.width,
      parent.y + anchor.y * parent.height - pivot.y * size.height, inherited);
  };
  const placeStack = (node: Extract<GameUiNode, { kind: "stack" }>, box: GameUiBox, list: readonly GameUiNode[]): void => {
    const padding = node.padding ?? 0;
    const gap = node.gap ?? 0;
    const vertical = (node.direction ?? "vertical") === "vertical";
    const cross = vertical ? box.width - padding * 2 : box.height - padding * 2;
    const share = { start: 0, center: 0.5, end: 1 }[node.align ?? "start"];
    let along = padding;
    for (const child of list) {
      const size = sizeOf(child);
      const slack = (cross - (vertical ? size.width : size.height)) * share;
      if (vertical) { place(child, box.x + padding + slack, box.y + along, box.opacity); }
      else { place(child, box.x + along, box.y + padding + slack, box.opacity); }
      along += (vertical ? size.height : size.width) + gap;
    }
  };
  const placeGrid = (node: Extract<GameUiNode, { kind: "grid" }>, box: GameUiBox, list: readonly GameUiNode[]): void => {
    const padding = node.padding ?? 0;
    const gap = node.gap ?? 0;
    const cell = gridCell(list, sizeOf);
    list.forEach((child, index) => {
      const column = index % node.columns;
      const row = Math.floor(index / node.columns);
      place(child, box.x + padding + column * (cell.width + gap), box.y + padding + row * (cell.height + gap), box.opacity);
    });
  };
  for (const node of children.get(undefined) ?? []) { anchored(node, root, 1); }
  return boxes;
}

function gridCell(list: readonly GameUiNode[], sizeOf: (node: GameUiNode) => Size): Size {
  let width = 0;
  let height = 0;
  for (const child of list) {
    const size = sizeOf(child);
    width = Math.max(width, size.width);
    height = Math.max(height, size.height);
  }
  return { width, height };
}

function contentSize(node: GameUiNode, list: readonly GameUiNode[], sizeOf: (node: GameUiNode) => Size, measure: GameUiMeasureText): Size {
  if (node.kind === "text") {
    const size = node.size ?? GAME_UI_TEXT_SIZE;
    return { width: measure(node.text, size, node.fontId), height: size * GAME_UI_LINE_HEIGHT };
  }
  if (node.kind === "stack") {
    const padding = node.padding ?? 0;
    const gap = list.length > 1 ? (node.gap ?? 0) * (list.length - 1) : 0;
    const sizes = list.map(sizeOf);
    const vertical = (node.direction ?? "vertical") === "vertical";
    const along = sizes.reduce((sum, size) => sum + (vertical ? size.height : size.width), 0) + gap;
    const across = sizes.reduce((maximum, size) => Math.max(maximum, vertical ? size.width : size.height), 0);
    return vertical ? { width: across + padding * 2, height: along + padding * 2 } : { width: along + padding * 2, height: across + padding * 2 };
  }
  if (node.kind === "grid") {
    const padding = node.padding ?? 0;
    const gap = node.gap ?? 0;
    const cell = gridCell(list, sizeOf);
    const columns = Math.min(node.columns, list.length);
    const rows = Math.ceil(list.length / node.columns);
    return { width: columns * cell.width + Math.max(0, columns - 1) * gap + padding * 2,
      height: rows * cell.height + Math.max(0, rows - 1) * gap + padding * 2 };
  }
  // Validation requires an explicit size for the other kinds. A document that skips validation draws nothing for them.
  return { width: 0, height: 0 };
}

/** The topmost visible button under a HUD point, or undefined. */
export function hitGameUiButton(boxes: readonly GameUiBox[], x: number, y: number): GameUiBox | undefined {
  for (let index = boxes.length - 1; index >= 0; index--) {
    const box = boxes[index];
    if (box.node.kind === "button" && x >= box.x && y >= box.y && x < box.x + box.width && y < box.y + box.height) { return box; }
  }
  return undefined;
}

export type GameUiDirection = "up" | "down" | "left" | "right";

/**
 * The button focus moves to from `currentId` in `direction`: the nearest button whose centre lies that way,
 * with sideways distance counted double. Without a current focus it is the first button in paint order.
 */
export function nextGameUiFocus(boxes: readonly GameUiBox[], currentId: string | undefined, direction: GameUiDirection): string | undefined {
  const buttons = boxes.filter((box) => box.node.kind === "button");
  const current = buttons.find((box) => box.node.id === currentId);
  if (!current) { return buttons[0]?.node.id; }
  const [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[direction];
  const cx = current.x + current.width / 2;
  const cy = current.y + current.height / 2;
  let best: { id: string; score: number } | undefined;
  for (const box of buttons) {
    if (box === current) { continue; }
    const ox = box.x + box.width / 2 - cx;
    const oy = box.y + box.height / 2 - cy;
    const forward = ox * dx + oy * dy;
    if (forward <= 0) { continue; }
    const score = forward + 2 * Math.abs(ox * dy - oy * dx);
    if (!best || score < best.score) { best = { id: box.node.id, score }; }
  }
  return best?.id ?? current.node.id;
}
