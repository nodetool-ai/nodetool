import { z } from "zod";
import { gameUiIssues, gameUiTree, type GameUiIssue, type GameUiTree } from "./game-ui.js";

const screenId = z.string().min(1).max(64);
const screenFields = { id: screenId, pauseSimulation: z.boolean().optional() };
const reservedAction = (action: string): boolean => action.startsWith("settings:");

/** Presentation screens use the same trees as the HUD. Settings may request the generated tree by omitting ui. */
export const gameScreen = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("title"), ...screenFields, ui: gameUiTree }),
  z.strictObject({ kind: z.literal("pause"), ...screenFields, ui: gameUiTree }),
  z.strictObject({ kind: z.literal("settings"), ...screenFields, ui: gameUiTree.optional() }),
  z.strictObject({ kind: z.literal("gameOver"), ...screenFields, ui: gameUiTree }),
  z.strictObject({ kind: z.literal("custom"), ...screenFields, ui: gameUiTree })
]);

export type GameScreen = z.infer<typeof gameScreen>;

/** A null endpoint means gameplay. Declaration order selects the first matching transition. */
export const gameScreenTransition = z.strictObject({
  from: screenId.nullable(),
  on: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("action"), action: screenId.refine((action) => !reservedAction(action),
      "settings: actions are reserved for generated settings controls") }),
    z.strictObject({ kind: z.literal("trigger"), event: screenId }),
    z.strictObject({ kind: z.literal("win") })
  ]),
  to: screenId.nullable()
});

export type GameScreenTransition = z.infer<typeof gameScreenTransition>;

/** Optional document screens. Omitted initial means gameplay. Runtime snapshots never contain menu state. */
export const gameScreens = z.strictObject({
  initial: screenId.optional(),
  items: z.array(gameScreen).min(1).max(32),
  transitions: z.array(gameScreenTransition).max(128)
}).superRefine((screens, context) => {
  const ids = new Set<string>();
  for (const [index, screen] of screens.items.entries()) {
    if (ids.has(screen.id)) {
      context.addIssue({ code: "custom", path: ["items", index, "id"], message: `Screen id ${screen.id} is used twice` });
    }
    ids.add(screen.id);
  }
  if (screens.initial !== undefined && !ids.has(screens.initial)) {
    context.addIssue({ code: "custom", path: ["initial"], message: `Initial screen ${screens.initial} does not exist` });
  }
  const selectors = new Set<string>();
  for (const [index, transition] of screens.transitions.entries()) {
    for (const endpoint of ["from", "to"] as const) {
      const id = transition[endpoint];
      if (id !== null && !ids.has(id)) {
        context.addIssue({ code: "custom", path: ["transitions", index, endpoint], message: `Screen ${id} does not exist` });
      }
    }
    if (transition.from === transition.to) {
      context.addIssue({ code: "custom", path: ["transitions", index, "to"], message: "A screen transition must change screens" });
    }
    const on = transition.on;
    const selector = JSON.stringify([transition.from, on.kind, on.kind === "action" ? on.action : on.kind === "trigger" ? on.event : null]);
    if (selectors.has(selector)) {
      context.addIssue({ code: "custom", path: ["transitions", index, "on"], message: "A screen transition selector is used twice" });
    }
    selectors.add(selector);
  }
});

export type GameScreens = z.infer<typeof gameScreens>;

interface ScreenSource {
  readonly screens?: GameScreens;
  readonly inputActions: readonly string[];
  readonly assets: Readonly<Record<string, { readonly mediaKind?: string }>>;
  readonly ui?: GameUiTree;
  readonly scenes: readonly {
    readonly id: string;
    readonly ui?: GameUiTree;
    readonly entities: readonly { readonly id: string; readonly behaviors?: readonly { readonly kind: string }[] }[];
  }[];
}

/** Checks authored input actions, HUD references and reserved generated controls without combining screen node namespaces. */
export function gameScreenIssues(source: ScreenSource): GameUiIssue[] {
  if (!source.screens) { return []; }
  const issues: GameUiIssue[] = [];
  const actions = new Set(source.inputActions);
  for (const [index, transition] of source.screens.transitions.entries()) {
    if (transition.on.kind === "action" && !actions.has(transition.on.action)) {
      issues.push({ path: ["screens", "transitions", index, "on", "action"],
        message: `Screen transition presses undeclared input action ${transition.on.action}` });
    }
  }
  const scenes = source.scenes.map(({ id, entities }) => ({ id, entities }));
  for (const [index, screen] of source.screens.items.entries()) {
    if (!screen.ui) { continue; }
    for (const issue of gameUiIssues({ inputActions: source.inputActions, assets: source.assets, scenes, ui: screen.ui })) {
      issues.push({ ...issue, path: ["screens", "items", index, ...issue.path] });
    }
    for (const [nodeIndex, node] of screen.ui.nodes.entries()) {
      if (node.kind === "button" && reservedAction(node.action)) {
        issues.push({ path: ["screens", "items", index, "ui", "nodes", nodeIndex, "action"],
          message: "settings: actions are reserved for generated settings controls" });
      }
    }
  }
  return issues;
}
