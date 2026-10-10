import type { GameAudioEmitter, GameRenderFrame, GameRenderFrame3D, GameTransform3D } from "@nodetool-ai/protocol";

export interface GameAudioVector {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** A listener or emitter position. `forward` orients a directional emitter and the listener. */
export interface GameAudioPose {
  readonly position: GameAudioVector;
  readonly forward?: GameAudioVector;
  readonly up?: GameAudioVector;
}

/** Where the listener and emitters are on one rendered frame. Emitter poses are looked up by entity id. */
export interface GameAudioSpatialView {
  readonly listener: Required<GameAudioPose>;
  emitter(entityId: string): GameAudioPose | undefined;
}

/** `high` uses HRTF panning. `low` uses equal-power panning, which costs far less CPU per voice. */
export type GameAudioSpatialQuality = "high" | "low";

/** Speed of sound in world units per second, with one world unit as one metre. */
const SPEED_OF_SOUND = 343;
/** Doppler pitch stays within one octave of the original. */
const MIN_DOPPLER_RATE = 0.5;
const MAX_DOPPLER_RATE = 2;
/** Time constant for per-frame position and pitch changes, so 60 Hz updates do not click. */
const SMOOTHING_SECONDS = 0.02;
/** Frame gaps longer than this, such as a paused tab, do not count as motion for doppler. */
const MAX_DOPPLER_GAP_SECONDS = 0.25;

const FORWARD: GameAudioVector = { x: 0, y: 0, z: -1 };
const UP: GameAudioVector = { x: 0, y: 1, z: 0 };

function lerp(from: number, to: number, alpha: number): number {
  return from + (to - from) * alpha;
}

function rotate(rotation: GameTransform3D["rotation"], vector: GameAudioVector): GameAudioVector {
  const [qx, qy, qz, qw] = rotation;
  const tx = 2 * (qy * vector.z - qz * vector.y);
  const ty = 2 * (qz * vector.x - qx * vector.z);
  const tz = 2 * (qx * vector.y - qy * vector.x);
  return { x: vector.x + qw * tx + (qy * tz - qz * ty), y: vector.y + qw * ty + (qz * tx - qx * tz), z: vector.z + qw * tz + (qx * ty - qy * tx) };
}

/** Normalised linear interpolation. Close enough to slerp for one tick of rotation. */
function interpolateRotation(previous: GameTransform3D["rotation"], current: GameTransform3D["rotation"], alpha: number): GameTransform3D["rotation"] {
  const sign = previous[0] * current[0] + previous[1] * current[1] + previous[2] * current[2] + previous[3] * current[3] < 0 ? -1 : 1;
  const mixed = [0, 1, 2, 3].map((index) => lerp(previous[index], current[index] * sign, alpha));
  const length = Math.hypot(...mixed) || 1;
  return [mixed[0] / length, mixed[1] / length, mixed[2] / length, mixed[3] / length];
}

function pose3D(previous: GameTransform3D, current: GameTransform3D, alpha: number): Required<GameAudioPose> {
  const rotation = interpolateRotation(previous.rotation, current.rotation, alpha);
  return {
    position: { x: lerp(previous.position.x, current.position.x, alpha), y: lerp(previous.position.y, current.position.y, alpha),
      z: lerp(previous.position.z, current.position.z, alpha) },
    forward: rotate(rotation, FORWARD), up: rotate(rotation, UP)
  };
}

/** Builds a view from a 3D frame at the renderer's interpolation `alpha`. The listener is the active camera. */
export function gameAudioSpatialView3D(frame: GameRenderFrame3D, alpha: number): GameAudioSpatialView {
  const amount = Math.max(0, Math.min(1, alpha));
  let entities: Map<string, GameRenderFrame3D["entities"][number]> | undefined;
  return {
    listener: pose3D(frame.camera.previousTransform ?? frame.camera.transform, frame.camera.transform, amount),
    emitter(entityId) {
      entities ??= new Map(frame.entities.map((entity) => [entity.entityId, entity]));
      const entity = entities.get(entityId);
      return entity ? pose3D(entity.previousTransform, entity.transform, amount) : undefined;
    }
  };
}

/**
 * Builds a view from a 2D frame. The listener sits at the camera on the z = 0 plane, facing -z with +y up,
 * so +x is to the right. Emitters are positioned by their sprite or particle emitter and have no facing.
 */
export function gameAudioSpatialView2D(frame: GameRenderFrame, alpha: number): GameAudioSpatialView {
  const amount = Math.max(0, Math.min(1, alpha));
  let positions: Map<string, GameAudioVector> | undefined;
  return {
    listener: {
      position: { x: lerp(frame.camera.previousX ?? frame.camera.x, frame.camera.x, amount), y: lerp(frame.camera.previousY ?? frame.camera.y, frame.camera.y, amount), z: 0 },
      forward: FORWARD, up: UP
    },
    emitter(entityId) {
      if (!positions) {
        positions = new Map();
        for (const particles of frame.particles ?? []) { positions.set(particles.entityId, { x: particles.x, y: particles.y, z: 0 }); }
        for (const sprite of frame.sprites) {
          positions.set(sprite.entityId, { x: lerp(sprite.previousX, sprite.x, amount), y: lerp(sprite.previousY, sprite.y, amount), z: 0 });
        }
      }
      const position = positions.get(entityId);
      return position ? { position } : undefined;
    }
  };
}

function setParam(param: AudioParam, value: number, time: number, smooth: boolean): void {
  if (smooth) { param.setTargetAtTime(value, time, SMOOTHING_SECONDS); }
  else { param.setValueAtTime(value, time); }
}

/** Creates the panner for one spatial voice at the emitter's position when it played. */
export function createGameAudioPanner(context: BaseAudioContext, emitter: GameAudioEmitter, quality: GameAudioSpatialQuality, time: number): PannerNode {
  const panner = context.createPanner();
  panner.panningModel = quality === "high" ? "HRTF" : "equalpower";
  panner.distanceModel = emitter.distanceModel;
  panner.refDistance = emitter.minDistance;
  panner.maxDistance = emitter.maxDistance;
  panner.rolloffFactor = emitter.distanceModel === "linear" ? Math.min(1, emitter.rolloff) : emitter.rolloff;
  placeGameAudioPanner(panner, emitter, { position: emitter.position }, time, false);
  return panner;
}

/**
 * Moves a panner to an emitter pose. The cone applies only once the pose has a facing, so 2D emitters stay omnidirectional.
 * `smooth` glides to the new values for per-frame updates.
 */
export function placeGameAudioPanner(panner: PannerNode, emitter: GameAudioEmitter, pose: GameAudioPose, time: number, smooth: boolean): void {
  setParam(panner.positionX, pose.position.x, time, smooth);
  setParam(panner.positionY, pose.position.y, time, smooth);
  setParam(panner.positionZ, pose.position.z, time, smooth);
  if (emitter.cone && pose.forward) {
    panner.coneInnerAngle = emitter.cone.innerAngle;
    panner.coneOuterAngle = emitter.cone.outerAngle;
    panner.coneOuterGain = emitter.cone.outerGain;
    setParam(panner.orientationX, pose.forward.x, time, smooth);
    setParam(panner.orientationY, pose.forward.y, time, smooth);
    setParam(panner.orientationZ, pose.forward.z, time, smooth);
  }
}

/** Moves the context's listener. Falls back to the legacy setters where a browser lacks listener AudioParams. */
export function placeGameAudioListener(listener: AudioListener, pose: Required<GameAudioPose>, time: number, smooth: boolean): void {
  if (!listener.positionX) {
    listener.setPosition(pose.position.x, pose.position.y, pose.position.z);
    listener.setOrientation(pose.forward.x, pose.forward.y, pose.forward.z, pose.up.x, pose.up.y, pose.up.z);
    return;
  }
  setParam(listener.positionX, pose.position.x, time, smooth);
  setParam(listener.positionY, pose.position.y, time, smooth);
  setParam(listener.positionZ, pose.position.z, time, smooth);
  setParam(listener.forwardX, pose.forward.x, time, smooth);
  setParam(listener.forwardY, pose.forward.y, time, smooth);
  setParam(listener.forwardZ, pose.forward.z, time, smooth);
  setParam(listener.upX, pose.up.x, time, smooth);
  setParam(listener.upY, pose.up.y, time, smooth);
  setParam(listener.upZ, pose.up.z, time, smooth);
}

/** A position at a context time, for velocity estimates. */
export interface GameAudioSample {
  readonly position: GameAudioVector;
  readonly time: number;
}

/** Velocity between two samples, or null when the gap is empty or too long to be motion. */
export function gameAudioVelocity(previous: GameAudioSample | undefined, current: GameAudioSample): GameAudioVector | null {
  if (!previous) { return null; }
  const seconds = current.time - previous.time;
  if (seconds <= 0 || seconds > MAX_DOPPLER_GAP_SECONDS) { return null; }
  return { x: (current.position.x - previous.position.x) / seconds, y: (current.position.y - previous.position.y) / seconds,
    z: (current.position.z - previous.position.z) / seconds };
}

/**
 * Playback rate for the doppler shift heard by a listener from an emitter. `factor` scales both velocities: 0 is no shift, 1 is physical.
 * An approaching emitter or listener raises the pitch.
 */
export function gameAudioDopplerRate(listener: GameAudioVector, listenerVelocity: GameAudioVector, emitter: GameAudioVector,
  emitterVelocity: GameAudioVector, factor: number): number {
  const dx = emitter.x - listener.x;
  const dy = emitter.y - listener.y;
  const dz = emitter.z - listener.z;
  const distance = Math.hypot(dx, dy, dz);
  if (factor <= 0 || distance === 0) { return 1; }
  const listenerToward = factor * (listenerVelocity.x * dx + listenerVelocity.y * dy + listenerVelocity.z * dz) / distance;
  const emitterAway = factor * (emitterVelocity.x * dx + emitterVelocity.y * dy + emitterVelocity.z * dz) / distance;
  const rate = (SPEED_OF_SOUND + listenerToward) / Math.max(1, SPEED_OF_SOUND + emitterAway);
  return Math.min(MAX_DOPPLER_RATE, Math.max(MIN_DOPPLER_RATE, rate));
}

/** Glides a source's playback rate to the doppler rate. */
export function setGameAudioDopplerRate(param: AudioParam, rate: number, time: number): void {
  param.setTargetAtTime(rate, time, SMOOTHING_SECONDS * 2.5);
}
