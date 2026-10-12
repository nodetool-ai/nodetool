import type { Edge, Node } from "@xyflow/react";
import type {
  GameAnimationCondition3D, GameAnimationGraph3D, GameAnimationLayer3D, GameAnimationMotion3D, GameAnimationTransition3D, GameInspection3D
} from "@nodetool-ai/protocol";

import { ANY_ANIMATION_STATE } from "./animationGraphEdits";

export const ANIMATION_STATE_NODE_TYPE = "animationState";
/** Handle IDs on a state node. Forward transitions run right to left edge, backward ones bottom to bottom. */
export const ANIMATION_HANDLE = { in: "in", out: "out", backIn: "back-in", backOut: "back-out" } as const;
const COLUMN_WIDTH = 240;
const ROW_HEIGHT = 96;

export interface AnimationGraphPosition { readonly x: number; readonly y: number; }

/** One layer's state in the play session: the current state, and the state it is blending out of. */
export interface AnimationGraphLiveLayer {
  readonly state: string;
  readonly previousState?: string;
  readonly blending: boolean;
}

export interface AnimationGraphLiveState {
  readonly entityId: string;
  readonly tick: number;
  readonly parameters: Readonly<Record<string, number | boolean>>;
  readonly layers: readonly AnimationGraphLiveLayer[];
}

export interface AnimationStateNodeData extends Record<string, unknown> {
  readonly stateId: string;
  readonly motion: string;
  readonly initial: boolean;
  readonly any: boolean;
  readonly live: "current" | "previous" | null;
}

export type AnimationStateFlowNode = Node<AnimationStateNodeData, typeof ANIMATION_STATE_NODE_TYPE>;

export type AnimationGraphSelection =
  | { readonly kind: "state"; readonly stateId: string }
  | { readonly kind: "transition"; readonly index: number };

/**
 * Reads graph state for one graph from the inspection. The preferred entity wins when
 * it runs this graph; otherwise the first entity running it, in inspection order.
 */
export function animationGraphLiveState(inspection: Pick<GameInspection3D, "tick" | "entities"> | null | undefined,
  graphId: string, preferredEntityId?: string): AnimationGraphLiveState | null {
  if (!inspection) { return null; }
  const running = inspection.entities.filter((entity) => entity.active && entity.animationGraph?.graphId === graphId);
  const entity = running.find((entry) => entry.id === preferredEntityId || entry.sourceId === preferredEntityId) ?? running[0];
  const runtime = entity?.animationGraph;
  if (!entity || !runtime) { return null; }
  return { entityId: entity.id, tick: inspection.tick, parameters: runtime.parameters,
    layers: runtime.layers.map((layer) => {
      const blending = layer.previousState !== undefined && layer.transitionTicks !== undefined
        && inspection.tick < layer.enteredTick + layer.transitionTicks;
      return { state: layer.state, previousState: blending ? layer.previousState : undefined, blending };
    }) };
}

export function animationMotionLabel(motion: GameAnimationMotion3D): string {
  if (motion.kind === "clip") { return motion.clip; }
  if (motion.kind === "blend1d") { return `Blend by ${motion.parameter} · ${motion.points.length} clips`; }
  return `Blend by ${motion.parameterX}, ${motion.parameterY} · ${motion.points.length} clips`;
}

const OP_SYMBOL: Readonly<Record<string, string>> = { gt: ">", gte: "≥", lt: "<", lte: "≤", eq: "=", neq: "≠" };

export function animationConditionLabel(condition: GameAnimationCondition3D): string {
  if (condition.op === "true") { return condition.parameter; }
  if (condition.op === "false") { return `not ${condition.parameter}`; }
  if (condition.op === "set") { return `${condition.parameter} fired`; }
  return `${condition.parameter} ${OP_SYMBOL[condition.op]} ${condition.value ?? 0}`;
}

export function animationTransitionLabel(transition: GameAnimationTransition3D): string {
  const parts = transition.conditions.map(animationConditionLabel);
  if (transition.exitTicks !== undefined) { parts.push(`after ${transition.exitTicks} ticks`); }
  return parts.join(" and ");
}

/**
 * Places states in columns by transition distance from the initial state, in document
 * order within a column. States no transition reaches go in a last column, and the
 * any-state node sits above the initial state.
 */
export function layoutAnimationStates(layer: GameAnimationLayer3D): Record<string, AnimationGraphPosition> {
  const stateIds = Object.keys(layer.states);
  const depth = new Map<string, number>();
  const start = Object.hasOwn(layer.states, layer.initialState) ? layer.initialState : stateIds[0];
  const queue: string[] = [];
  if (start !== undefined) { depth.set(start, 0); queue.push(start); }
  const outgoing = new Map<string, string[]>();
  for (const transition of layer.transitions) {
    const targets = outgoing.get(transition.from) ?? [];
    targets.push(transition.to);
    outgoing.set(transition.from, targets);
  }
  for (const target of outgoing.get(ANY_ANIMATION_STATE) ?? []) {
    if (!depth.has(target) && Object.hasOwn(layer.states, target)) { depth.set(target, 1); queue.push(target); }
  }
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head];
    for (const target of outgoing.get(current) ?? []) {
      if (!depth.has(target) && Object.hasOwn(layer.states, target)) { depth.set(target, (depth.get(current) ?? 0) + 1); queue.push(target); }
    }
  }
  const lastColumn = Math.max(0, ...depth.values()) + 1;
  const rows = new Map<number, number>();
  const positions: Record<string, AnimationGraphPosition> = {};
  for (const stateId of stateIds) {
    const column = depth.get(stateId) ?? lastColumn;
    const row = rows.get(column) ?? 0;
    rows.set(column, row + 1);
    positions[stateId] = { x: column * COLUMN_WIDTH, y: (row + 1) * ROW_HEIGHT };
  }
  positions[ANY_ANIMATION_STATE] = { x: 0, y: 0 };
  return positions;
}

/** ReactFlow nodes for one layer. The any-state node is drawn only when a transition starts from it or `showAny` is set. */
export function animationGraphNodes(layer: GameAnimationLayer3D, positions: Readonly<Record<string, AnimationGraphPosition>>,
  live: AnimationGraphLiveLayer | null, selection: AnimationGraphSelection | null, showAny: boolean): AnimationStateFlowNode[] {
  const fallback = layoutAnimationStates(layer);
  const nodes: AnimationStateFlowNode[] = [];
  if (showAny || layer.transitions.some((transition) => transition.from === ANY_ANIMATION_STATE)) {
    nodes.push({ id: ANY_ANIMATION_STATE, type: ANIMATION_STATE_NODE_TYPE, position: positions[ANY_ANIMATION_STATE] ?? fallback[ANY_ANIMATION_STATE],
      selected: false, deletable: false,
      data: { stateId: ANY_ANIMATION_STATE, motion: "Any state", initial: false, any: true, live: null } });
  }
  for (const [stateId, node] of Object.entries(layer.states)) {
    nodes.push({ id: stateId, type: ANIMATION_STATE_NODE_TYPE, position: positions[stateId] ?? fallback[stateId],
      selected: selection?.kind === "state" && selection.stateId === stateId,
      data: { stateId, motion: animationMotionLabel(node.motion), initial: layer.initialState === stateId, any: false,
        live: live?.state === stateId ? "current" : live?.previousState === stateId ? "previous" : null } });
  }
  return nodes;
}

/**
 * ReactFlow edges for one layer's transitions. A transition whose target is not to the
 * right of its source, by node position, uses the bottom handles.
 */
export function animationGraphEdges(layer: GameAnimationLayer3D, live: AnimationGraphLiveLayer | null, selection: AnimationGraphSelection | null,
  positions: Readonly<Record<string, AnimationGraphPosition>>): Edge[] {
  return layer.transitions.map((transition, index) => {
    const firing = Boolean(live?.blending && live.previousState === transition.from && live.state === transition.to);
    const from = positions[transition.from];
    const to = positions[transition.to];
    const backward = transition.from !== ANY_ANIMATION_STATE && from !== undefined && to !== undefined && to.x <= from.x;
    return { id: `transition-${index}`, source: transition.from, target: transition.to, label: animationTransitionLabel(transition),
      sourceHandle: backward ? ANIMATION_HANDLE.backOut : ANIMATION_HANDLE.out, targetHandle: backward ? ANIMATION_HANDLE.backIn : ANIMATION_HANDLE.in,
      selected: selection?.kind === "transition" && selection.index === index, animated: firing,
      data: { index }, className: firing ? "animation-transition-live" : undefined };
  });
}

export function transitionIndexOfEdge(edge: Pick<Edge, "id">): number | null {
  const match = /^transition-(\d+)$/.exec(edge.id);
  return match ? Number(match[1]) : null;
}

/** Validation messages inside one graph, as `path: message` lines. */
export function animationGraphDiagnostics(diagnostics: readonly { readonly path: readonly (string | number)[]; readonly message: string }[],
  graphId: string): string[] {
  return diagnostics.filter((entry) => entry.path[0] === "animationGraphs" && entry.path[1] === graphId)
    .map((entry) => entry.path.length > 2 ? `${entry.path.slice(2).join(".")}: ${entry.message}` : entry.message);
}

export function animationGraphClipAliases(graph: GameAnimationGraph3D | undefined): string[] {
  const clips = new Set<string>();
  for (const layer of graph?.layers ?? []) {
    for (const node of Object.values(layer.states)) {
      if (node.motion.kind === "clip") { clips.add(node.motion.clip); } else { for (const point of node.motion.points) { clips.add(point.clip); } }
    }
  }
  return [...clips];
}
