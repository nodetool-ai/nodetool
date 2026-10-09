import type { GameAnimationGraph3D, GameAnimationMotion3D, GameAssetBinding3D, GameDocument3D, GameEntity3D } from "@nodetool-ai/protocol";
import { ANY_ANIMATION_STATE } from "./systems/animation-graph3d.js";

type AddDiagnostic = (code: string, path: (string | number)[], message: string) => void;

function motionClips(motion: GameAnimationMotion3D): string[] {
  return motion.kind === "clip" ? [motion.clip] : motion.points.map((point) => point.clip);
}

/** Checks references inside one graph: states, transitions, parameters and blend points. */
export function validateAnimationGraph3D(graph: GameAnimationGraph3D, path: (string | number)[], add: AddDiagnostic): void {
  const parameterKind = (name: string): string | undefined => graph.parameters[name]?.kind;
  const layerIds = new Set<string>();
  graph.layers.forEach((layer, layerIndex) => {
    const layerPath = [...path, "layers", layerIndex];
    if (layerIds.has(layer.id)) { add("duplicate_animation_layer", [...layerPath, "id"], `Duplicate animation layer ${layer.id}`); }
    layerIds.add(layer.id);
    if (layerIndex === 0 && (layer.mode !== "override" || layer.mask)) {
      add("invalid_animation_base_layer", layerPath, "The first animation layer must be an unmasked override layer");
    }
    if (!Object.hasOwn(layer.states, layer.initialState)) {
      add("missing_animation_state", [...layerPath, "initialState"], `Animation state ${layer.initialState} does not exist`);
    }
    for (const [stateId, node] of Object.entries(layer.states)) {
      const statePath = [...layerPath, "states", stateId];
      if (stateId === ANY_ANIMATION_STATE) { add("reserved_animation_state", statePath, `State ID ${ANY_ANIMATION_STATE} is reserved for any-state transitions`); }
      const motion = node.motion;
      const floatParameter = (name: string, key: string): void => {
        if (parameterKind(name) !== "float") { add("invalid_animation_parameter", [...statePath, "motion", key], `Blend parameter ${name} must be a declared float`); }
      };
      if (motion.kind === "blend1d") {
        floatParameter(motion.parameter, "parameter");
        for (let index = 1; index < motion.points.length; index += 1) {
          if (motion.points[index].value <= motion.points[index - 1].value) {
            add("invalid_blend_points", [...statePath, "motion", "points", index], "1D blend points must have strictly increasing values");
          }
        }
      } else if (motion.kind === "blend2d") {
        floatParameter(motion.parameterX, "parameterX");
        floatParameter(motion.parameterY, "parameterY");
        const seen = new Set<string>();
        motion.points.forEach((point, index) => {
          const key = `${point.x},${point.y}`;
          if (seen.has(key)) { add("invalid_blend_points", [...statePath, "motion", "points", index], "2D blend points must not repeat a position"); }
          seen.add(key);
        });
      }
    }
    layer.transitions.forEach((transition, transitionIndex) => {
      const transitionPath = [...layerPath, "transitions", transitionIndex];
      if (transition.from !== ANY_ANIMATION_STATE && !Object.hasOwn(layer.states, transition.from)) {
        add("missing_animation_state", [...transitionPath, "from"], `Animation state ${transition.from} does not exist`);
      }
      if (!Object.hasOwn(layer.states, transition.to)) {
        add("missing_animation_state", [...transitionPath, "to"], `Animation state ${transition.to} does not exist`);
      }
      if (transition.conditions.length === 0 && transition.exitTicks === undefined) {
        add("unconditional_animation_transition", transitionPath, "A transition needs at least one condition or exitTicks");
      }
      transition.conditions.forEach((condition, conditionIndex) => {
        const conditionPath = [...transitionPath, "conditions", conditionIndex];
        const kind = parameterKind(condition.parameter);
        const expected = condition.op === "set" ? "trigger" : condition.op === "true" || condition.op === "false" ? "bool" : "float";
        if (kind !== expected) {
          add("invalid_animation_condition", conditionPath, `Condition ${condition.op} requires a declared ${expected} parameter ${condition.parameter}`);
        }
        if ((expected === "float") !== (condition.value !== undefined)) {
          add("invalid_animation_condition", [...conditionPath, "value"], expected === "float" ? "Float comparisons require a value" : "Only float comparisons take a value");
        }
      });
    });
  });
}

/** Checks that an entity's animator can drive the graph it names. */
export function validateAnimatorGraph3D(
  document: GameDocument3D,
  entity: GameEntity3D,
  asset: GameAssetBinding3D | undefined,
  path: (string | number)[],
  add: AddDiagnostic
): void {
  const animator = entity.animator3d;
  if (animator?.graph === undefined) {
    return;
  }
  const graph = document.animationGraphs?.[animator.graph];
  if (!graph) {
    add("missing_animation_graph", [...path, "graph"], `Animation graph ${animator.graph} does not exist`);
    return;
  }
  if (animator.initialClip !== undefined) {
    add("animation_graph_conflict", [...path, "initialClip"], "An animator with a graph starts from the graph's initial states. Remove initialClip.");
  }
  const missing = new Set<string>();
  for (const layer of graph.layers) {
    for (const node of Object.values(layer.states)) {
      for (const clip of motionClips(node.motion)) {
        if (!Object.hasOwn(animator.clips, clip)) { missing.add(clip); }
      }
    }
  }
  for (const clip of missing) {
    add("missing_animation_clip", [...path, "clips"], `Graph ${animator.graph} plays clip alias ${clip}, which this animator does not map`);
  }
  if (asset?.mediaKind === "model") {
    graph.layers.forEach((layer) => {
      for (const nodeId of layer.mask ?? []) {
        if (!asset.nodeIds.includes(nodeId)) {
          add("missing_model_node", [...path, "graph"], `Layer ${layer.id} masks node ${nodeId}, which the model does not contain`);
        }
      }
    });
  }
}
