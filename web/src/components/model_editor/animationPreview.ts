import * as THREE from "three";

interface PoseSnapshot {
  object: THREE.Object3D;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
  morph: number[] | null;
}

/**
 * Plays the model's glTF animations in the editor without changing the scene
 * that gets saved. Starting a clip records the rest pose of every object, and
 * `stop` puts it back, so a save never bakes an animated frame into the model.
 */
export interface AnimationPreview {
  readonly clips: readonly THREE.AnimationClip[];
  /** True between the first `select` and `stop`. */
  isActive: () => boolean;
  /** Make `index` the playing clip, recording the rest pose on first use. */
  select: (index: number) => void;
  /** Jump to `seconds` within the clip. */
  setTime: (seconds: number) => void;
  /** Move the clip forward by `delta` seconds, looping, and return the new time. */
  advance: (delta: number) => number;
  time: () => number;
  duration: () => number;
  /** Return every object to its rest pose and release the mixer. */
  stop: () => void;
}

const capturePose = (root: THREE.Object3D): PoseSnapshot[] => {
  const poses: PoseSnapshot[] = [];
  root.traverse((object) => {
    const influences =
      object instanceof THREE.Mesh ? object.morphTargetInfluences : undefined;
    poses.push({
      object,
      position: object.position.clone(),
      quaternion: object.quaternion.clone(),
      scale: object.scale.clone(),
      morph: influences ? [...influences] : null
    });
  });
  return poses;
};

const restorePose = (poses: PoseSnapshot[]): void => {
  for (const pose of poses) {
    pose.object.position.copy(pose.position);
    pose.object.quaternion.copy(pose.quaternion);
    pose.object.scale.copy(pose.scale);
    if (pose.morph && pose.object instanceof THREE.Mesh && pose.object.morphTargetInfluences) {
      pose.object.morphTargetInfluences.splice(0, pose.morph.length, ...pose.morph);
    }
    pose.object.updateMatrix();
  }
};

export const createAnimationPreview = (
  root: THREE.Object3D,
  clips: readonly THREE.AnimationClip[]
): AnimationPreview => {
  let mixer: THREE.AnimationMixer | null = null;
  let action: THREE.AnimationAction | null = null;
  let rest: PoseSnapshot[] | null = null;

  const duration = () => action?.getClip().duration ?? 0;

  const evaluate = (seconds: number) => {
    if (!mixer || !action) {
      return;
    }
    const length = duration();
    action.time = length > 0 ? ((seconds % length) + length) % length : 0;
    mixer.update(0);
  };

  return {
    clips,
    isActive: () => rest !== null,
    select: (index) => {
      const clip = clips[index];
      if (!clip) {
        return;
      }
      if (!rest) {
        rest = capturePose(root);
      }
      if (!mixer) {
        mixer = new THREE.AnimationMixer(root);
      }
      const time = action?.time ?? 0;
      action?.stop();
      if (rest) {
        restorePose(rest);
      }
      action = mixer.clipAction(clip);
      action.play();
      evaluate(Math.min(time, clip.duration));
    },
    setTime: evaluate,
    advance: (delta) => {
      if (!action) {
        return 0;
      }
      evaluate(action.time + delta);
      return action.time;
    },
    time: () => action?.time ?? 0,
    duration,
    stop: () => {
      if (mixer) {
        mixer.stopAllAction();
        for (const clip of clips) {
          mixer.uncacheClip(clip);
        }
        mixer.uncacheRoot(root);
      }
      mixer = null;
      action = null;
      if (rest) {
        restorePose(rest);
        rest = null;
      }
    }
  };
};
