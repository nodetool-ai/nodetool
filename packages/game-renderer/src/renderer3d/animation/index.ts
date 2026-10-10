import * as THREE from "three";
import type { GameAnimationPose3D, GameAnimationState3D } from "@nodetool-ai/protocol";
/** Evaluates cosmetic clips from an explicit simulation tick without accumulating wall-clock deltas. */
export function sampleGameAnimation3D(mixer: THREE.AnimationMixer, clips: readonly THREE.AnimationClip[], state: GameAnimationState3D, tick: number): void {
  mixer.stopAllAction();
  const elapsed = Math.max(0, tick - state.startTick);
  const transition = state.previousClipId !== undefined && (state.transitionTicks ?? 0) > 0
    ? Math.min(1, elapsed / (state.transitionTicks ?? 1)) : 1;
  const sample = (id: string, startTick: number, weight: number): void => {
    const match = /^clip:(\d+)$/.exec(id);
    const clip = match ? clips[Number(match[1])] : undefined;
    if (!clip) { throw new Error(`Prepared animation clip ${id} does not exist`); }
    const time = Math.max(0, tick - startTick) / 60 * state.playbackRate;
    const action = mixer.clipAction(clip);
    action.reset().setEffectiveWeight(weight).setEffectiveTimeScale(0).play();
    action.loop = state.loop ? THREE.LoopRepeat : THREE.LoopOnce;
    action.clampWhenFinished = !state.loop;
    action.time = state.loop && clip.duration > 0 ? time % clip.duration : Math.min(time, clip.duration);
  };
  if (state.previousClipId !== undefined && transition < 1) { sample(state.previousClipId, state.previousStartTick ?? state.startTick, 1 - transition); }
  sample(state.clipId, state.startTick, transition);
  mixer.update(0);
}

type PoseProperty = "position" | "quaternion" | "scale";

interface PoseChannel {
  readonly node: THREE.Object3D;
  readonly property: PoseProperty;
  readonly interpolant: THREE.Interpolant;
  readonly reference: readonly number[];
}

interface RestPose {
  readonly position: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
  readonly scale: THREE.Vector3;
}

interface PoseAccumulator {
  readonly position: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
  readonly scale: THREE.Vector3;
  positionWeight: number;
  quaternionWeight: number;
  scaleWeight: number;
}

const channelCache = new WeakMap<THREE.Object3D, Map<THREE.AnimationClip, PoseChannel[]>>();
const restCache = new WeakMap<THREE.Object3D, Map<THREE.Object3D, RestPose>>();
const maskCache = new WeakMap<THREE.Object3D, Map<string, ReadonlySet<THREE.Object3D>>>();
const POSE_PROPERTIES: readonly PoseProperty[] = ["position", "quaternion", "scale"];

function preparedClip(clips: readonly THREE.AnimationClip[], id: string): THREE.AnimationClip {
  const match = /^clip:(\d+)$/.exec(id);
  const clip = match ? clips[Number(match[1])] : undefined;
  if (!clip) { throw new Error(`Prepared animation clip ${id} does not exist`); }
  return clip;
}

function poseChannels(root: THREE.Object3D, clip: THREE.AnimationClip): PoseChannel[] {
  let byClip = channelCache.get(root);
  if (!byClip) { byClip = new Map(); channelCache.set(root, byClip); }
  let channels = byClip.get(clip);
  if (!channels) {
    channels = [];
    for (const track of clip.tracks) {
      const parsed = THREE.PropertyBinding.parseTrackName(track.name);
      if (parsed.objectName || parsed.propertyIndex !== undefined) { continue; }
      const node = THREE.PropertyBinding.findNode(root, parsed.nodeName);
      const property = POSE_PROPERTIES.find((candidate) => candidate === parsed.propertyName);
      if (!(node instanceof THREE.Object3D) || !property) { continue; }
      // KeyframeTrack assigns createInterpolant per interpolation mode, and GLTFLoader replaces it for cubic splines.
      const interpolant: unknown = "createInterpolant" in track && typeof track.createInterpolant === "function" ? track.createInterpolant() : undefined;
      if (!(interpolant instanceof THREE.Interpolant)) { throw new Error(`Animation track ${track.name} has no interpolant`); }
      channels.push({ node, property, interpolant, reference: Array.from(track.values.slice(0, track.getValueSize())) });
    }
    byClip.set(clip, channels);
  }
  return channels;
}

function restPose(root: THREE.Object3D): Map<THREE.Object3D, RestPose> {
  let rest = restCache.get(root);
  if (!rest) {
    const captured = new Map<THREE.Object3D, RestPose>();
    root.traverse((node) => { captured.set(node, { position: node.position.clone(), quaternion: node.quaternion.clone(), scale: node.scale.clone() }); });
    rest = captured;
    restCache.set(root, rest);
  }
  return rest;
}

function maskedNodes(root: THREE.Object3D, mask: readonly string[]): ReadonlySet<THREE.Object3D> {
  let byKey = maskCache.get(root);
  if (!byKey) { byKey = new Map(); maskCache.set(root, byKey); }
  const key = mask.join("\n");
  let nodes = byKey.get(key);
  if (!nodes) {
    const selected = new Set<THREE.Object3D>();
    root.traverse((node) => {
      if (typeof node.userData.gameNodeId === "string" && mask.includes(node.userData.gameNodeId)) { node.traverse((child) => selected.add(child)); }
    });
    nodes = selected;
    byKey.set(key, nodes);
  }
  return nodes;
}

/** Clip times for one motion. Blended clips share one normalized phase so strides stay aligned. */
function motionTimes(clips: readonly THREE.AnimationClip[], sample: GameAnimationPose3D["layers"][number]["current"], tick: number, scale: number) {
  const resolved = sample.clips.map((entry) => ({ clip: preparedClip(clips, entry.clipId), weight: entry.weight * scale }));
  const elapsed = Math.max(0, tick - sample.startTick) / 60 * sample.rate;
  const total = resolved.reduce((sum, entry) => sum + entry.weight, 0);
  const duration = total > 0 ? resolved.reduce((sum, entry) => sum + entry.weight * entry.clip.duration, 0) / total : 0;
  const phase = duration <= 0 ? 0 : sample.loop ? (elapsed / duration) % 1 : Math.min(1, elapsed / duration);
  return resolved.map((entry) => ({ ...entry, time: entry.clip.duration * phase }));
}

/**
 * Applies a graph pose from an explicit simulation tick. Each call starts from the rest pose captured when the
 * instance was first sampled, so the result depends only on the pose and tick. Override layers blend toward their
 * sampled pose by layer weight. Additive layers add each clip's offset from its first keyframe.
 */
export function sampleGameAnimationPose3D(root: THREE.Object3D, clips: readonly THREE.AnimationClip[], pose: GameAnimationPose3D, tick: number): void {
  for (const [node, rest] of restPose(root)) {
    node.position.copy(rest.position); node.quaternion.copy(rest.quaternion); node.scale.copy(rest.scale);
  }
  const value = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const reference = new THREE.Quaternion();
  for (const layer of pose.layers) {
    const alpha = layer.previous && layer.transitionTicks ? Math.max(0, Math.min(1, (tick - layer.current.startTick) / layer.transitionTicks)) : 1;
    const contributions = [...motionTimes(clips, layer.current, tick, alpha), ...(layer.previous && alpha < 1 ? motionTimes(clips, layer.previous, tick, 1 - alpha) : [])];
    const mask = layer.mask ? maskedNodes(root, layer.mask) : undefined;
    const additive = layer.mode === "additive";
    const accumulators = new Map<THREE.Object3D, PoseAccumulator>();
    for (const contribution of contributions) {
      if (contribution.weight <= 0) { continue; }
      for (const channel of poseChannels(root, contribution.clip)) {
        if (mask && !mask.has(channel.node)) { continue; }
        let accumulator = accumulators.get(channel.node);
        if (!accumulator) {
          accumulator = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(0, 0, 0, 0), scale: new THREE.Vector3(), positionWeight: 0, quaternionWeight: 0, scaleWeight: 0 };
          accumulators.set(channel.node, accumulator);
        }
        const sampled = channel.interpolant.evaluate(contribution.time);
        const weight = contribution.weight;
        if (channel.property === "quaternion") {
          rotation.fromArray(sampled);
          if (additive) { rotation.premultiply(reference.fromArray(channel.reference).invert()); }
          const sign = accumulator.quaternionWeight > 0 && accumulator.quaternion.dot(rotation) < 0 ? -1 : 1;
          accumulator.quaternion.set(accumulator.quaternion.x + rotation.x * weight * sign, accumulator.quaternion.y + rotation.y * weight * sign,
            accumulator.quaternion.z + rotation.z * weight * sign, accumulator.quaternion.w + rotation.w * weight * sign);
          accumulator.quaternionWeight += weight;
        } else {
          value.fromArray(sampled);
          if (additive) {
            if (channel.property === "position") { value.sub(new THREE.Vector3().fromArray(channel.reference)); }
            else { value.divide(new THREE.Vector3().fromArray(channel.reference.map((component) => component === 0 ? 1 : component))); }
          }
          if (channel.property === "position") { accumulator.position.addScaledVector(value, weight); accumulator.positionWeight += weight; }
          else { accumulator.scale.addScaledVector(value, weight); accumulator.scaleWeight += weight; }
        }
      }
    }
    for (const [node, accumulator] of accumulators) {
      if (accumulator.positionWeight > 0) {
        const amount = layer.weight * Math.min(1, accumulator.positionWeight);
        value.copy(accumulator.position).divideScalar(accumulator.positionWeight);
        if (additive) { node.position.addScaledVector(value, amount); } else { node.position.lerp(value, amount); }
      }
      if (accumulator.quaternionWeight > 0) {
        const amount = layer.weight * Math.min(1, accumulator.quaternionWeight);
        rotation.copy(accumulator.quaternion).normalize();
        if (additive) { node.quaternion.multiply(reference.identity().slerp(rotation, amount)); } else { node.quaternion.slerp(rotation, amount); }
      }
      if (accumulator.scaleWeight > 0) {
        const amount = layer.weight * Math.min(1, accumulator.scaleWeight);
        value.copy(accumulator.scale).divideScalar(accumulator.scaleWeight);
        if (additive) { node.scale.multiply(value.lerp(new THREE.Vector3(1, 1, 1), 1 - amount)); } else { node.scale.lerp(value, amount); }
      }
    }
  }
}
