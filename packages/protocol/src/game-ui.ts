import { z } from "zod";

const finite = z.number().finite();
const uiId = z.string().min(1).max(64);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const unit = z.number().finite().min(0).max(1);
const pixels = finite.min(0).max(4096);
const size = finite.positive().max(4096);

/** A point in [0, 1] of a rectangle: {x: 0, y: 0} is its top-left corner and {x: 1, y: 1} its bottom-right. */
export const gameUiPoint = z.strictObject({ x: unit, y: unit });

export type GameUiPoint = z.infer<typeof gameUiPoint>;

/**
 * Placement shared by every HUD node. A node outside a stack or grid sits at `anchor` of its parent's
 * rectangle (the HUD rectangle for a root node), moved by `offset` pixels, with its own `pivot` on that point.
 * `pivot` defaults to `anchor`, so a node anchored to the top-right corner keeps its top-right corner there.
 */
const nodePlacement = {
  id: uiId,
  parent: uiId.optional(),
  anchor: gameUiPoint.optional(),
  pivot: gameUiPoint.optional(),
  offset: z.strictObject({ x: finite.min(-4096).max(4096), y: finite.min(-4096).max(4096) }).optional(),
  width: size.optional(),
  height: size.optional(),
  visible: z.boolean().optional(),
  opacity: unit.optional()
};

const textStyle = {
  size: finite.positive().max(256).optional(),
  color: color.optional(),
  fontId: uiId.optional()
};

/** What a bar shows: a value scripts set with the `ui` command, or the health of an entity with a health behavior. */
export const gameUiBarSource = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("value") }),
  z.strictObject({ kind: z.literal("health"), entityId: uiId })
]);

export type GameUiBarSource = z.infer<typeof gameUiBarSource>;

/** One node of a HUD tree. `panel`, `stack` and `grid` hold children. The others are leaves. */
export const gameUiNode = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("panel"), ...nodePlacement, color: color.optional(), cornerRadius: pixels.max(256).optional() }),
  z.strictObject({ kind: z.literal("image"), ...nodePlacement, assetId: uiId }),
  z.strictObject({ kind: z.literal("text"), ...nodePlacement, ...textStyle, text: z.string().max(256),
    align: z.enum(["left", "center", "right"]).optional() }),
  z.strictObject({ kind: z.literal("bar"), ...nodePlacement, source: gameUiBarSource.optional(),
    value: finite.min(0).max(1e9).optional(), max: finite.positive().max(1e9).optional(),
    color: color.optional(), background: color.optional(),
    direction: z.enum(["leftToRight", "rightToLeft", "bottomToTop", "topToBottom"]).optional() }),
  z.strictObject({ kind: z.literal("button"), ...nodePlacement, ...textStyle, action: uiId, text: z.string().max(64).optional(),
    background: color.optional() }),
  z.strictObject({ kind: z.literal("stack"), ...nodePlacement, direction: z.enum(["vertical", "horizontal"]).optional(),
    gap: pixels.optional(), padding: pixels.optional(), align: z.enum(["start", "center", "end"]).optional() }),
  z.strictObject({ kind: z.literal("grid"), ...nodePlacement, columns: z.number().int().min(1).max(32),
    gap: pixels.optional(), padding: pixels.optional() })
]);

export type GameUiNode = z.infer<typeof gameUiNode>;
export type GameUiNodeKind = GameUiNode["kind"];

/**
 * A HUD widget tree. Nodes paint in array order, and a child must come after its parent.
 * `safeArea` (default true) keeps anchors inside the device's safe-area insets.
 * `focusNavigation` (default false) lets the gamepad D-pad move focus between buttons and button 0 press the
 * focused one. While it is on and a button is visible, those gamepad buttons drive the HUD instead of the game.
 */
export const gameUiTree = z.strictObject({
  safeArea: z.boolean().optional(),
  focusNavigation: z.boolean().optional(),
  nodes: z.array(gameUiNode).max(256)
});

export type GameUiTree = z.infer<typeof gameUiTree>;

const overrideFields = {
  text: z.string().max(256).optional(),
  value: finite.min(0).max(1e9).optional(),
  max: finite.positive().max(1e9).optional(),
  visible: z.boolean().optional()
};

/** What scripts changed on one node since the scene started. Saved in snapshots. */
export const gameUiOverride = z.strictObject(overrideFields);
/** Script overrides saved in a snapshot, keyed by HUD node id. */
export const gameUiOverrides = z.record(uiId, gameUiOverride);

export type GameUiOverride = z.infer<typeof gameUiOverride>;

/** The script command that changes a HUD node: text of a text or button, value and max of a bar, visibility of any node. */
export const gameUiScriptCommand = z.strictObject({ kind: z.literal("ui"), id: uiId, ...overrideFields });

export type GameUiScriptCommand = z.infer<typeof gameUiScriptCommand>;

/**
 * The HUD tree a frame shows: the document tree, then the scene tree, with script overrides applied and
 * health bars resolved to a value and max. The host adds `focusId`, the focused button, and `insets`, the
 * device safe area in HUD pixels. Neither comes from the simulation.
 */
export const gameUiFrame = z.strictObject({
  safeArea: z.boolean(),
  focusNavigation: z.boolean(),
  nodes: z.array(gameUiNode).max(512),
  focusId: uiId.optional(),
  insets: z.strictObject({ top: pixels, right: pixels, bottom: pixels, left: pixels }).optional()
});

export type GameUiFrame = z.infer<typeof gameUiFrame>;

export const GAME_UI_CONTAINER_KINDS: ReadonlySet<GameUiNodeKind> = new Set(["panel", "stack", "grid"]);

/** Kinds that need an explicit width and height, because they have no content to size them from. */
const SIZED_KINDS: ReadonlySet<GameUiNodeKind> = new Set(["panel", "image", "bar", "button"]);

export interface GameUiIssue {
  readonly path: (string | number)[];
  readonly message: string;
}

interface GameUiScene {
  readonly id: string;
  readonly ui?: GameUiTree;
  readonly entities: readonly { readonly id: string; readonly behaviors?: readonly { readonly kind: string }[] }[];
}

interface GameUiSource {
  readonly inputActions: readonly string[];
  readonly assets: Readonly<Record<string, { readonly mediaKind?: string }>>;
  readonly ui?: GameUiTree;
  readonly scenes: readonly GameUiScene[];
}

function treeIssues(tree: GameUiTree, path: (string | number)[], source: GameUiSource, reserved: ReadonlySet<string>,
  healthEntities: ReadonlySet<string> | undefined): GameUiIssue[] {
  const issues: GameUiIssue[] = [];
  const seen = new Map<string, GameUiNodeKind>();
  for (const [index, node] of tree.nodes.entries()) {
    const at = [...path, "nodes", index];
    if (seen.has(node.id) || reserved.has(node.id)) { issues.push({ path: [...at, "id"], message: `HUD node id ${node.id} is used twice` }); }
    if (node.parent !== undefined) {
      const parentKind = seen.get(node.parent);
      if (parentKind === undefined) { issues.push({ path: [...at, "parent"], message: `HUD node ${node.id} names parent ${node.parent}, which is not an earlier node of this tree` }); }
      else if (!GAME_UI_CONTAINER_KINDS.has(parentKind)) { issues.push({ path: [...at, "parent"], message: `HUD node ${node.parent} is a ${parentKind} and cannot hold children` }); }
    }
    if (SIZED_KINDS.has(node.kind) && (node.width === undefined || node.height === undefined)) {
      issues.push({ path: at, message: `HUD ${node.kind} ${node.id} needs a width and a height` });
    }
    if (node.kind === "button" && !source.inputActions.includes(node.action)) {
      issues.push({ path: [...at, "action"], message: `HUD button ${node.id} presses undeclared input action ${node.action}` });
    }
    if (node.kind === "image" && source.assets[node.assetId]?.mediaKind !== "image") {
      issues.push({ path: [...at, "assetId"], message: `HUD image ${node.id} uses missing image asset ${node.assetId}` });
    }
    if ((node.kind === "text" || node.kind === "button") && node.fontId !== undefined && source.assets[node.fontId]?.mediaKind !== "font") {
      issues.push({ path: [...at, "fontId"], message: `HUD node ${node.id} uses missing font ${node.fontId}` });
    }
    if (node.kind === "bar" && node.source?.kind === "health" && healthEntities && !healthEntities.has(node.source.entityId)) {
      issues.push({ path: [...at, "source", "entityId"], message: `HUD bar ${node.id} reads health of ${node.source.entityId}, which has no health behavior in this scene` });
    }
    seen.set(node.id, node.kind);
  }
  return issues;
}

function healthEntityIds(scene: GameUiScene): Set<string> {
  return new Set(scene.entities.filter((entity) => entity.behaviors?.some((behavior) => behavior.kind === "health")).map((entity) => entity.id));
}

/**
 * Reference checks for the document and scene HUD trees: unique ids across the document tree and each scene
 * tree, parents that are earlier containers, sizes, button actions, image and font assets and health sources.
 * A document-level health bar must name an entity with health in every scene.
 */
export function gameUiIssues(source: GameUiSource): GameUiIssue[] {
  const issues: GameUiIssue[] = [];
  const documentIds = new Set((source.ui?.nodes ?? []).map((node) => node.id));
  if (source.ui) {
    const everyScene = source.scenes.map(healthEntityIds);
    const shared = new Set([...(everyScene[0] ?? [])].filter((id) => everyScene.every((ids) => ids.has(id))));
    issues.push(...treeIssues(source.ui, ["ui"], source, new Set(), shared));
  }
  for (const [index, scene] of source.scenes.entries()) {
    if (scene.ui) { issues.push(...treeIssues(scene.ui, ["scenes", index, "ui"], source, documentIds, healthEntityIds(scene))); }
  }
  return issues;
}

/** The node a `ui` command may change, or why it may not. */
export function gameUiCommandTarget(nodes: readonly GameUiNode[], command: GameUiScriptCommand): GameUiNode | string {
  const node = nodes.find((candidate) => candidate.id === command.id);
  if (!node) { return `Game script changes missing HUD node ${command.id}`; }
  if (command.text !== undefined && node.kind !== "text" && node.kind !== "button") {
    return `Game script sets text on HUD ${node.kind} ${node.id}`;
  }
  if ((command.value !== undefined || command.max !== undefined) && node.kind !== "bar") {
    return `Game script sets a value on HUD ${node.kind} ${node.id}`;
  }
  return node;
}

/** Folds a `ui` command into the overrides, keeping fields earlier commands set. */
export function applyGameUiCommand(overrides: Map<string, GameUiOverride>, command: GameUiScriptCommand): void {
  const { kind: _kind, id, ...fields } = command;
  const next: GameUiOverride = { ...overrides.get(id) };
  for (const key of ["text", "value", "max", "visible"] as const) {
    if (fields[key] !== undefined) { (next as Record<string, unknown>)[key] = fields[key]; }
  }
  overrides.set(id, next);
}

/**
 * The tree a frame shows for one scene, or undefined when neither the document nor the scene has one.
 * `health` returns an entity's current and maximum health, or undefined when it has none.
 */
export function resolveGameUiFrame(documentTree: GameUiTree | undefined, sceneTree: GameUiTree | undefined,
  overrides: ReadonlyMap<string, GameUiOverride>,
  health: (entityId: string) => { readonly value: number; readonly max: number } | undefined): GameUiFrame | undefined {
  if (!documentTree && !sceneTree) { return undefined; }
  const nodes = [...(documentTree?.nodes ?? []), ...(sceneTree?.nodes ?? [])].map((node): GameUiNode => {
    const override = overrides.get(node.id);
    let resolved: GameUiNode = node;
    if (override) {
      resolved = { ...resolved };
      if (override.visible !== undefined) { resolved.visible = override.visible; }
      if (override.text !== undefined && (resolved.kind === "text" || resolved.kind === "button")) { resolved.text = override.text; }
      if (resolved.kind === "bar") {
        if (override.value !== undefined) { resolved.value = override.value; }
        if (override.max !== undefined) { resolved.max = override.max; }
      }
    }
    if (resolved.kind === "bar" && resolved.source?.kind === "health") {
      const current = health(resolved.source.entityId);
      resolved = { ...resolved, value: current?.value ?? 0, max: current?.max ?? resolved.max };
    }
    return resolved;
  });
  return {
    safeArea: sceneTree?.safeArea ?? documentTree?.safeArea ?? true,
    focusNavigation: sceneTree?.focusNavigation ?? documentTree?.focusNavigation ?? false,
    nodes
  };
}
