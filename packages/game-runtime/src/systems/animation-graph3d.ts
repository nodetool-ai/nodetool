import type {
  GameAnimationCondition3D,
  GameAnimationGraph3D,
  GameAnimationGraphNode3D,
  GameAnimationGraphRuntime3D,
  GameAnimationMotion3D,
  GameAnimationPose3D,
  GameDocument3D
} from "@nodetool-ai/protocol";
import type { EntityState3D } from "../spatial3d/state.js";

/** The `from` value of a transition that may leave any state in its layer. */
export const ANY_ANIMATION_STATE = "*";

type AnimationParameters = GameAnimationGraphRuntime3D["parameters"];
type MotionSample = GameAnimationPose3D["layers"][number]["current"];

interface BoundGraph3D {
  readonly graph: GameAnimationGraph3D;
  readonly runtime: GameAnimationGraphRuntime3D;
}

function graphOf(document: GameDocument3D, state: EntityState3D): { readonly id: string; readonly graph: GameAnimationGraph3D } | undefined {
  const graphId = state.definition.animator3d?.graph;
  if (graphId === undefined) {
    return undefined;
  }
  const graph = document.animationGraphs?.[graphId];
  if (!graph) {
    throw new Error(`Animation graph ${graphId} does not exist (${state.definition.id})`);
  }
  return { id: graphId, graph };
}

function initialAnimationGraph3D(graphId: string, graph: GameAnimationGraph3D, tick: number): GameAnimationGraphRuntime3D {
  const parameters: AnimationParameters = {};
  for (const [name, parameter] of Object.entries(graph.parameters)) {
    parameters[name] = parameter.kind === "trigger" ? false : parameter.default;
  }
  return { graphId, parameters, layers: graph.layers.map((layer) => ({ state: layer.initialState, enteredTick: tick })) };
}

/** Reads graph state without creating it. An entity that has not stepped yet reports its spawn state. */
function readAnimationGraph3D(document: GameDocument3D, state: EntityState3D): BoundGraph3D | undefined {
  const bound = graphOf(document, state);
  if (!bound) {
    return undefined;
  }
  return { graph: bound.graph, runtime: state.animationGraph ?? initialAnimationGraph3D(bound.id, bound.graph, state.spawnTick) };
}

function ensureAnimationGraph3D(document: GameDocument3D, state: EntityState3D): BoundGraph3D | undefined {
  const bound = readAnimationGraph3D(document, state);
  if (bound && !state.animationGraph) {
    state.animationGraph = bound.runtime;
  }
  return bound;
}

/** Applies a `setAnimParam` script command. Triggers take `true` to fire and `false` to reset. */
export function setAnimationParameter3D(document: GameDocument3D, state: EntityState3D, name: string, value: number | boolean): void {
  const bound = ensureAnimationGraph3D(document, state);
  const parameter = bound?.graph.parameters[name];
  if (!bound || !parameter) {
    throw new Error(`Unknown animation parameter ${name} for ${state.definition.id}`);
  }
  if ((parameter.kind === "float") !== (typeof value === "number")) {
    throw new Error(`Animation parameter ${name} expects a ${parameter.kind === "float" ? "number" : "boolean"} (${state.definition.id})`);
  }
  bound.runtime.parameters[name] = value;
}

/**
 * Maps the legacy `playAnimation` command onto a direct base-layer state change. The clip name selects a
 * base-layer state with that ID, or else the first base-layer state that plays that clip alias.
 * Returns false when the entity has no graph so the caller keeps the clip-only path.
 */
export function playAnimationGraphState3D(document: GameDocument3D, state: EntityState3D, clip: string, tick: number): boolean {
  const bound = ensureAnimationGraph3D(document, state);
  if (!bound) {
    return false;
  }
  const definition = bound.graph.layers[0];
  const layer = bound.runtime.layers[0];
  const target = Object.hasOwn(definition.states, clip)
    ? clip
    : Object.entries(definition.states).find(([, node]) => node.motion.kind === "clip" && node.motion.clip === clip)?.[0];
  if (target === undefined) {
    throw new Error(`Unknown animation ${clip} for ${state.definition.id}`);
  }
  if (layer.state !== target) {
    enterState(layer, target, tick, state.definition.animator3d?.transitionTicks ?? 0);
  }
  return true;
}

function enterState(layer: GameAnimationGraphRuntime3D["layers"][number], target: string, tick: number, durationTicks: number): void {
  const previous = { state: layer.state, enteredTick: layer.enteredTick };
  delete layer.previousState;
  delete layer.previousEnteredTick;
  delete layer.transitionTicks;
  layer.state = target;
  layer.enteredTick = tick;
  if (durationTicks > 0) {
    layer.previousState = previous.state;
    layer.previousEnteredTick = previous.enteredTick;
    layer.transitionTicks = durationTicks;
  }
}

function conditionHolds(condition: GameAnimationCondition3D, parameters: AnimationParameters): boolean {
  const value = parameters[condition.parameter];
  const operand = condition.value ?? 0;
  switch (condition.op) {
    case "true":
    case "set":
      return value === true;
    case "false":
      return value === false;
    default:
      if (typeof value !== "number") {
        return false;
      }
      switch (condition.op) {
        case "gt": return value > operand;
        case "gte": return value >= operand;
        case "lt": return value < operand;
        case "lte": return value <= operand;
        case "eq": return value === operand;
        case "neq": return value !== operand;
      }
  }
}

/**
 * Advances every active graph to `tick`. A layer that is crossfading does not start another transition.
 * Transitions are checked in document order. Triggers consumed by any layer reset after all layers run.
 */
export function stepAnimationGraphs3D(document: GameDocument3D, states: readonly EntityState3D[], tick: number): void {
  if (!document.animationGraphs) {
    return;
  }
  for (const state of states) {
    if (!state.active) {
      continue;
    }
    const bound = ensureAnimationGraph3D(document, state);
    if (!bound) {
      continue;
    }
    const consumed = new Set<string>();
    bound.graph.layers.forEach((definition, index) => {
      const layer = bound.runtime.layers[index];
      if (layer.previousState !== undefined) {
        const elapsed = tick - layer.enteredTick;
        if (elapsed < (layer.transitionTicks ?? 0)) {
          return;
        }
        // The finished crossfade stays one extra tick so the renderer's interpolated sample reaches full weight.
        if (elapsed > (layer.transitionTicks ?? 0)) {
          delete layer.previousState;
          delete layer.previousEnteredTick;
          delete layer.transitionTicks;
        }
      }
      for (const transition of definition.transitions) {
        if (transition.from !== layer.state && (transition.from !== ANY_ANIMATION_STATE || transition.to === layer.state)) {
          continue;
        }
        if (transition.exitTicks !== undefined && tick - layer.enteredTick < transition.exitTicks) {
          continue;
        }
        if (!transition.conditions.every((condition) => conditionHolds(condition, bound.runtime.parameters))) {
          continue;
        }
        for (const condition of transition.conditions) {
          if (condition.op === "set") {
            consumed.add(condition.parameter);
          }
        }
        enterState(layer, transition.to, tick, transition.durationTicks);
        break;
      }
    });
    for (const name of consumed) {
      bound.runtime.parameters[name] = false;
    }
  }
}

function addWeight(weights: Map<string, number>, clip: string, weight: number): void {
  if (weight > 0) {
    weights.set(clip, (weights.get(clip) ?? 0) + weight);
  }
}

/** Blend weights per clip alias. 1D blends interpolate neighbours. 2D blends use gradient-band interpolation. */
export function animationMotionWeights3D(motion: GameAnimationMotion3D, parameters: AnimationParameters): Map<string, number> {
  const weights = new Map<string, number>();
  const read = (name: string): number => {
    const value = parameters[name];
    return typeof value === "number" ? value : 0;
  };
  if (motion.kind === "clip") {
    weights.set(motion.clip, 1);
    return weights;
  }
  if (motion.kind === "blend1d") {
    const value = read(motion.parameter);
    const points = motion.points;
    if (value <= points[0].value) {
      addWeight(weights, points[0].clip, 1);
      return weights;
    }
    for (let index = 1; index < points.length; index += 1) {
      const low = points[index - 1];
      const high = points[index];
      if (value <= high.value) {
        const amount = (value - low.value) / (high.value - low.value);
        addWeight(weights, low.clip, 1 - amount);
        addWeight(weights, high.clip, amount);
        return weights;
      }
    }
    addWeight(weights, points[points.length - 1].clip, 1);
    return weights;
  }
  const x = read(motion.parameterX);
  const y = read(motion.parameterY);
  const raw = motion.points.map((point, index) => {
    let weight = 1;
    for (const [otherIndex, other] of motion.points.entries()) {
      if (otherIndex === index) {
        continue;
      }
      const edgeX = other.x - point.x;
      const edgeY = other.y - point.y;
      const length = edgeX * edgeX + edgeY * edgeY;
      const projected = 1 - ((x - point.x) * edgeX + (y - point.y) * edgeY) / length;
      weight = Math.min(weight, Math.max(0, Math.min(1, projected)));
    }
    return weight;
  });
  const total = raw.reduce((sum, weight) => sum + weight, 0);
  motion.points.forEach((point, index) => addWeight(weights, point.clip, total > 0 ? raw[index] / total : 0));
  return weights;
}

function motionSample(
  node: GameAnimationGraphNode3D,
  parameters: AnimationParameters,
  clips: Readonly<Record<string, string>>,
  startTick: number,
  playbackRate: number
): MotionSample {
  const resolved = new Map<string, number>();
  for (const [alias, weight] of animationMotionWeights3D(node.motion, parameters)) {
    const clipId = clips[alias];
    if (clipId === undefined) {
      throw new Error(`Animation clip alias ${alias} is not mapped`);
    }
    resolved.set(clipId, (resolved.get(clipId) ?? 0) + weight);
  }
  return {
    startTick,
    rate: playbackRate * node.speed,
    loop: node.loop,
    clips: [...resolved].map(([clipId, weight]) => ({ clipId, weight: Math.min(1, weight) }))
  };
}

/** Resolves graph state into the clip weights the renderer samples. The pose is presentation output only. */
export function animationPose3D(document: GameDocument3D, state: EntityState3D): GameAnimationPose3D | undefined {
  const bound = readAnimationGraph3D(document, state);
  const animator = state.definition.animator3d;
  if (!bound || !animator) {
    return undefined;
  }
  return {
    layers: bound.graph.layers.map((definition, index) => {
      const layer = bound.runtime.layers[index];
      const current = definition.states[layer.state];
      const entry: GameAnimationPose3D["layers"][number] = {
        mode: definition.mode,
        weight: definition.weight,
        current: motionSample(current, bound.runtime.parameters, animator.clips, layer.enteredTick, animator.playbackRate)
      };
      if (definition.mask) {
        entry.mask = [...definition.mask];
      }
      const previous = layer.previousState === undefined ? undefined : definition.states[layer.previousState];
      if (previous && layer.previousEnteredTick !== undefined && layer.transitionTicks !== undefined) {
        entry.previous = motionSample(previous, bound.runtime.parameters, animator.clips, layer.previousEnteredTick, animator.playbackRate);
        entry.transitionTicks = layer.transitionTicks;
      }
      return entry;
    })
  };
}
