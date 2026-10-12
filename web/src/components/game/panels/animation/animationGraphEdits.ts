import type {
  GameAnimationCondition3D, GameAnimationGraph3D, GameAnimationGraphNode3D, GameAnimationLayer3D, GameAnimationMotion3D,
  GameAnimationParameter3D, GameAnimationTransition3D
} from "@nodetool-ai/protocol";

/** The `from` value of an any-state transition. The runtime reserves it as a state ID. */
export const ANY_ANIMATION_STATE = "*";
export const MAX_ANIMATION_GRAPH_PARAMETERS = 64;
export const MAX_ANIMATION_LAYER_STATES = 64;
export const MAX_ANIMATION_LAYERS = 8;

export type AnimationParameterKind = GameAnimationParameter3D["kind"];
export type AnimationConditionOp = GameAnimationCondition3D["op"];

/** An edit the graph cannot take, such as a duplicate name. The panel shows the message and changes nothing. */
export class AnimationGraphEditError extends Error {}

const FLOAT_OPS: readonly AnimationConditionOp[] = ["gt", "gte", "lt", "lte", "eq", "neq"];

/** Condition operators that a parameter of this kind accepts. */
export function conditionOpsFor(kind: AnimationParameterKind): readonly AnimationConditionOp[] {
  if (kind === "float") { return FLOAT_OPS; }
  return kind === "bool" ? ["true", "false"] : ["set"];
}

/** The condition a new or retyped parameter starts with. */
export function defaultCondition(parameter: string, kind: AnimationParameterKind): GameAnimationCondition3D {
  if (kind === "float") { return { parameter, op: "gt", value: 0 }; }
  return { parameter, op: kind === "bool" ? "true" : "set" };
}

export function defaultParameter(kind: AnimationParameterKind): GameAnimationParameter3D {
  if (kind === "float") { return { kind, default: 0 }; }
  return kind === "bool" ? { kind, default: false } : { kind };
}

/** The first of `base`, `base2`, `base3`... that `taken` does not hold. */
export function uniqueAnimationName(taken: Iterable<string>, base: string): string {
  const names = new Set(taken);
  if (!names.has(base)) { return base; }
  let index = 2;
  while (names.has(`${base}${index}`)) { index += 1; }
  return `${base}${index}`;
}

function renameKey<Value>(record: Readonly<Record<string, Value>>, from: string, to: string): Record<string, Value> {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key === from ? to : key, value]));
}

function checkName(name: string, kind: string): string {
  const trimmed = name.trim();
  if (!trimmed) { throw new AnimationGraphEditError(`A ${kind} needs a name`); }
  if (trimmed === ANY_ANIMATION_STATE) { throw new AnimationGraphEditError(`${ANY_ANIMATION_STATE} is reserved for any-state transitions`); }
  return trimmed;
}

function layerAt(graph: GameAnimationGraph3D, layerIndex: number): GameAnimationLayer3D {
  const layer = graph.layers[layerIndex];
  if (!layer) { throw new AnimationGraphEditError(`Layer ${layerIndex + 1} does not exist`); }
  return layer;
}

function withLayer(graph: GameAnimationGraph3D, layerIndex: number, edit: (layer: GameAnimationLayer3D) => GameAnimationLayer3D): GameAnimationGraph3D {
  const layer = layerAt(graph, layerIndex);
  return { ...graph, layers: graph.layers.map((entry, index) => index === layerIndex ? edit(layer) : entry) };
}

function mapMotionParameters(motion: GameAnimationMotion3D, rename: (name: string) => string): GameAnimationMotion3D {
  if (motion.kind === "blend1d") { return { ...motion, parameter: rename(motion.parameter) }; }
  if (motion.kind === "blend2d") { return { ...motion, parameterX: rename(motion.parameterX), parameterY: rename(motion.parameterY) }; }
  return motion;
}

function motionParameters(motion: GameAnimationMotion3D): string[] {
  if (motion.kind === "blend1d") { return [motion.parameter]; }
  return motion.kind === "blend2d" ? [motion.parameterX, motion.parameterY] : [];
}

/** A graph with one base layer and one looping clip state, ready to attach to an animator. */
export function createAnimationGraph(clip: string): GameAnimationGraph3D {
  return { parameters: {}, layers: [{ id: "base", mode: "override", weight: 1, initialState: "idle",
    states: { idle: { motion: { kind: "clip", clip }, speed: 1, loop: true } }, transitions: [] }] };
}

export function addAnimationState(graph: GameAnimationGraph3D, layerIndex: number, rawId: string, node: GameAnimationGraphNode3D): GameAnimationGraph3D {
  const stateId = checkName(rawId, "state");
  return withLayer(graph, layerIndex, (layer) => {
    if (Object.hasOwn(layer.states, stateId)) { throw new AnimationGraphEditError(`State ${stateId} already exists`); }
    if (Object.keys(layer.states).length >= MAX_ANIMATION_LAYER_STATES) {
      throw new AnimationGraphEditError(`A layer holds at most ${MAX_ANIMATION_LAYER_STATES} states`);
    }
    return { ...layer, states: { ...layer.states, [stateId]: node } };
  });
}

/** Removes a state and every transition into or out of it. The first remaining state becomes initial if needed. */
export function removeAnimationState(graph: GameAnimationGraph3D, layerIndex: number, stateId: string): GameAnimationGraph3D {
  return withLayer(graph, layerIndex, (layer) => {
    if (!Object.hasOwn(layer.states, stateId)) { throw new AnimationGraphEditError(`State ${stateId} does not exist`); }
    const { [stateId]: _removed, ...states } = layer.states;
    const remaining = Object.keys(states);
    if (remaining.length === 0) { throw new AnimationGraphEditError("A layer needs at least one state"); }
    return { ...layer, states, initialState: layer.initialState === stateId ? remaining[0] : layer.initialState,
      transitions: layer.transitions.filter((transition) => transition.from !== stateId && transition.to !== stateId) };
  });
}

/** Renames a state in place and updates the initial state and every transition that names it. */
export function renameAnimationState(graph: GameAnimationGraph3D, layerIndex: number, from: string, rawTo: string): GameAnimationGraph3D {
  const to = checkName(rawTo, "state");
  if (to === from) { return graph; }
  return withLayer(graph, layerIndex, (layer) => {
    if (!Object.hasOwn(layer.states, from)) { throw new AnimationGraphEditError(`State ${from} does not exist`); }
    if (Object.hasOwn(layer.states, to)) { throw new AnimationGraphEditError(`State ${to} already exists`); }
    return { ...layer, states: renameKey(layer.states, from, to), initialState: layer.initialState === from ? to : layer.initialState,
      transitions: layer.transitions.map((transition) => ({ ...transition,
        from: transition.from === from ? to : transition.from, to: transition.to === from ? to : transition.to })) };
  });
}

export function setAnimationState(graph: GameAnimationGraph3D, layerIndex: number, stateId: string, node: GameAnimationGraphNode3D): GameAnimationGraph3D {
  return withLayer(graph, layerIndex, (layer) => {
    if (!Object.hasOwn(layer.states, stateId)) { throw new AnimationGraphEditError(`State ${stateId} does not exist`); }
    return { ...layer, states: { ...layer.states, [stateId]: node } };
  });
}

export function setInitialAnimationState(graph: GameAnimationGraph3D, layerIndex: number, stateId: string): GameAnimationGraph3D {
  return withLayer(graph, layerIndex, (layer) => {
    if (!Object.hasOwn(layer.states, stateId)) { throw new AnimationGraphEditError(`State ${stateId} does not exist`); }
    return { ...layer, initialState: stateId };
  });
}

/**
 * Appends a transition between two states. A transition needs a condition, so the
 * new one fires on a new trigger parameter named after its target state. When the
 * graph has no room for another parameter, it fires after the source state runs 30 ticks.
 */
export function connectAnimationStates(graph: GameAnimationGraph3D, layerIndex: number, from: string, to: string): GameAnimationGraph3D {
  const layer = layerAt(graph, layerIndex);
  if (from !== ANY_ANIMATION_STATE && !Object.hasOwn(layer.states, from)) { throw new AnimationGraphEditError(`State ${from} does not exist`); }
  if (!Object.hasOwn(layer.states, to)) { throw new AnimationGraphEditError(`State ${to} does not exist`); }
  if (layer.transitions.length >= 256) { throw new AnimationGraphEditError("A layer holds at most 256 transitions"); }
  const room = Object.keys(graph.parameters).length < MAX_ANIMATION_GRAPH_PARAMETERS;
  const trigger = uniqueAnimationName(Object.keys(graph.parameters), to);
  const transition: GameAnimationTransition3D = room
    ? { from, to, conditions: [defaultCondition(trigger, "trigger")], durationTicks: 6 }
    : { from, to, conditions: [], exitTicks: 30, durationTicks: 6 };
  const parameters = room ? { ...graph.parameters, [trigger]: defaultParameter("trigger") } : graph.parameters;
  return withLayer({ ...graph, parameters }, layerIndex, (entry) => ({ ...entry, transitions: [...entry.transitions, transition] }));
}

export function setAnimationTransition(graph: GameAnimationGraph3D, layerIndex: number, index: number, transition: GameAnimationTransition3D): GameAnimationGraph3D {
  return withLayer(graph, layerIndex, (layer) => {
    if (!layer.transitions[index]) { throw new AnimationGraphEditError(`Transition ${index + 1} does not exist`); }
    return { ...layer, transitions: layer.transitions.map((entry, position) => position === index ? transition : entry) };
  });
}

export function removeAnimationTransition(graph: GameAnimationGraph3D, layerIndex: number, index: number): GameAnimationGraph3D {
  return withLayer(graph, layerIndex, (layer) => {
    if (!layer.transitions[index]) { throw new AnimationGraphEditError(`Transition ${index + 1} does not exist`); }
    return { ...layer, transitions: layer.transitions.filter((_entry, position) => position !== index) };
  });
}

export function addAnimationParameter(graph: GameAnimationGraph3D, rawName: string, kind: AnimationParameterKind): GameAnimationGraph3D {
  const name = checkName(rawName, "parameter");
  if (Object.hasOwn(graph.parameters, name)) { throw new AnimationGraphEditError(`Parameter ${name} already exists`); }
  if (Object.keys(graph.parameters).length >= MAX_ANIMATION_GRAPH_PARAMETERS) {
    throw new AnimationGraphEditError(`A graph holds at most ${MAX_ANIMATION_GRAPH_PARAMETERS} parameters`);
  }
  return { ...graph, parameters: { ...graph.parameters, [name]: defaultParameter(kind) } };
}

/** Renames a parameter in place and updates every condition and blend motion that reads it, in every layer. */
export function renameAnimationParameter(graph: GameAnimationGraph3D, from: string, rawTo: string): GameAnimationGraph3D {
  const to = checkName(rawTo, "parameter");
  if (to === from) { return graph; }
  if (!Object.hasOwn(graph.parameters, from)) { throw new AnimationGraphEditError(`Parameter ${from} does not exist`); }
  if (Object.hasOwn(graph.parameters, to)) { throw new AnimationGraphEditError(`Parameter ${to} already exists`); }
  const rename = (name: string): string => name === from ? to : name;
  return { parameters: renameKey(graph.parameters, from, to), layers: graph.layers.map((layer) => ({ ...layer,
    states: Object.fromEntries(Object.entries(layer.states).map(([stateId, node]) => [stateId, { ...node, motion: mapMotionParameters(node.motion, rename) }])),
    transitions: layer.transitions.map((transition) => ({ ...transition,
      conditions: transition.conditions.map((condition) => ({ ...condition, parameter: rename(condition.parameter) })) })) })) };
}

/** Where a parameter is read, for messages such as "used by idle → run". */
export function animationParameterUses(graph: GameAnimationGraph3D, name: string): { readonly conditions: string[]; readonly blends: string[] } {
  const conditions: string[] = [];
  const blends: string[] = [];
  for (const layer of graph.layers) {
    for (const [stateId, node] of Object.entries(layer.states)) {
      if (motionParameters(node.motion).includes(name)) { blends.push(stateId); }
    }
    for (const transition of layer.transitions) {
      if (transition.conditions.some((condition) => condition.parameter === name)) { conditions.push(`${transition.from} → ${transition.to}`); }
    }
  }
  return { conditions, blends };
}

/** Removes an unused parameter. A parameter still read by a condition or blend is kept, and the error names the readers. */
export function removeAnimationParameter(graph: GameAnimationGraph3D, name: string): GameAnimationGraph3D {
  if (!Object.hasOwn(graph.parameters, name)) { throw new AnimationGraphEditError(`Parameter ${name} does not exist`); }
  const uses = animationParameterUses(graph, name);
  const readers = [...uses.conditions.map((entry) => `transition ${entry}`), ...uses.blends.map((entry) => `state ${entry}`)];
  if (readers.length > 0) { throw new AnimationGraphEditError(`Parameter ${name} is used by ${readers.join(", ")}`); }
  const { [name]: _removed, ...parameters } = graph.parameters;
  return { ...graph, parameters };
}

/**
 * Changes a parameter's kind and resets its default. Conditions that read it switch to
 * the new kind's default comparison. Blend motions accept only floats, so a parameter a
 * blend reads stays a float.
 */
export function setAnimationParameterKind(graph: GameAnimationGraph3D, name: string, kind: AnimationParameterKind): GameAnimationGraph3D {
  const current = graph.parameters[name];
  if (!current) { throw new AnimationGraphEditError(`Parameter ${name} does not exist`); }
  if (current.kind === kind) { return graph; }
  const blends = animationParameterUses(graph, name).blends;
  if (blends.length > 0) { throw new AnimationGraphEditError(`Parameter ${name} drives the blend in ${blends.join(", ")} and must stay a float`); }
  return { parameters: { ...graph.parameters, [name]: defaultParameter(kind) }, layers: graph.layers.map((layer) => ({ ...layer,
    transitions: layer.transitions.map((transition) => ({ ...transition,
      conditions: transition.conditions.map((condition) => condition.parameter === name ? defaultCondition(name, kind) : condition) })) })) };
}

export function setAnimationParameterDefault(graph: GameAnimationGraph3D, name: string, value: number | boolean): GameAnimationGraph3D {
  const current = graph.parameters[name];
  if (!current) { throw new AnimationGraphEditError(`Parameter ${name} does not exist`); }
  if (current.kind === "float" && typeof value === "number") { return { ...graph, parameters: { ...graph.parameters, [name]: { kind: "float", default: value } } }; }
  if (current.kind === "bool" && typeof value === "boolean") { return { ...graph, parameters: { ...graph.parameters, [name]: { kind: "bool", default: value } } }; }
  throw new AnimationGraphEditError(`Parameter ${name} has no ${typeof value} default`);
}

/** Adds an override layer above the others, starting in a copy of the base layer's initial state. */
export function addAnimationLayer(graph: GameAnimationGraph3D): GameAnimationGraph3D {
  if (graph.layers.length >= MAX_ANIMATION_LAYERS) { throw new AnimationGraphEditError(`A graph holds at most ${MAX_ANIMATION_LAYERS} layers`); }
  const base = graph.layers[0];
  const initial = base.states[base.initialState];
  if (!initial) { throw new AnimationGraphEditError("The base layer has no initial state to copy"); }
  const id = uniqueAnimationName(graph.layers.map((layer) => layer.id), "layer");
  return { ...graph, layers: [...graph.layers, { id, mode: "override", weight: 1, initialState: base.initialState,
    states: { [base.initialState]: initial }, transitions: [] }] };
}

export function removeAnimationLayer(graph: GameAnimationGraph3D, layerIndex: number): GameAnimationGraph3D {
  layerAt(graph, layerIndex);
  if (layerIndex === 0) { throw new AnimationGraphEditError("The base layer cannot be removed"); }
  return { ...graph, layers: graph.layers.filter((_layer, index) => index !== layerIndex) };
}

export function setAnimationLayerBlend(graph: GameAnimationGraph3D, layerIndex: number,
  patch: { readonly mode?: GameAnimationLayer3D["mode"]; readonly weight?: number }): GameAnimationGraph3D {
  if (layerIndex === 0) { throw new AnimationGraphEditError("The base layer always overrides at full weight"); }
  return withLayer(graph, layerIndex, (layer) => ({ ...layer, ...patch }));
}

/** Switches a state's motion kind, keeping its first clip. Blends read the first float parameters, so one must exist. */
export function convertAnimationMotion(graph: GameAnimationGraph3D, motion: GameAnimationMotion3D, kind: GameAnimationMotion3D["kind"]): GameAnimationMotion3D {
  if (motion.kind === kind) { return motion; }
  const clip = motion.kind === "clip" ? motion.clip : motion.points[0].clip;
  if (kind === "clip") { return { kind, clip }; }
  const floats = Object.entries(graph.parameters).filter(([, parameter]) => parameter.kind === "float").map(([name]) => name);
  if (floats.length === 0) { throw new AnimationGraphEditError("A blend reads a float parameter. Add one first."); }
  if (kind === "blend1d") { return { kind, parameter: floats[0], points: [{ value: 0, clip }, { value: 1, clip }] }; }
  return { kind, parameterX: floats[0], parameterY: floats[1] ?? floats[0],
    points: [{ x: 0, y: 0, clip }, { x: 1, y: 0, clip }, { x: 0, y: 1, clip }] };
}
