import * as THREE from "three";
import type { GameAnimationState3D } from "@nodetool-ai/protocol";
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
