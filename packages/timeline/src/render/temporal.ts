import type { ClipEffect, ClipTransform, TimelineClip } from "../types.js";
import { IDENTITY_TRANSFORM } from "./transform.js";

function repeatedEffects(effects: ClipEffect[] | undefined, hue: number, brightness: number): ClipEffect[] | undefined {
  if (hue === 0 && brightness === 0) return effects;
  return [...(effects ?? []), {
    id: "repeater-color",
    type: "color",
    enabled: true,
    hue: ((hue + 180) % 360 + 360) % 360 - 180,
    brightness: Math.max(-1, Math.min(1, brightness))
  }];
}

/** Visual copies are ordinary clips, so every render host decodes and draws them identically. */
export function expandTemporalClips(clips: readonly TimelineClip[]): TimelineClip[] {
  const result: TimelineClip[] = [];
  for (const clip of clips) {
    const instances: TimelineClip[] = [clip];
    const repeater = clip.repeater;
    const count = repeater ? Math.max(1, Math.min(128, Math.floor(repeater.count))) : 1;
    const columns = repeater?.columns ? Math.max(1, Math.min(128, Math.floor(repeater.columns))) : count;
    for (let index = 1; index < count; index++) {
      const base = clip.transform ?? IDENTITY_TRANSFORM;
      const column = index % columns;
      const row = Math.floor(index / columns);
      const transform: ClipTransform = {
        ...base,
        position: {
          x: base.position.x + column * (repeater?.positionStep.x ?? 0) + row * (repeater?.rowStep?.x ?? 0),
          y: base.position.y + column * (repeater?.positionStep.y ?? 0) + row * (repeater?.rowStep?.y ?? 0)
        }
      };
      instances.push({
        ...clip,
        id: `${clip.id}:repeat:${index}`,
        name: `${clip.name} ${index + 1}`,
        startMs: clip.startMs + index * (repeater?.timeStepMs ?? 0),
        transform,
        effects: repeatedEffects(clip.effects, index * (repeater?.colorStep?.hueDegrees ?? 0), index * (repeater?.colorStep?.brightness ?? 0)),
        repeater: undefined,
        layout: undefined,
        temporalEcho: clip.temporalEcho
      });
    }
    for (const instance of instances) {
      result.push(instance);
      const echo = instance.temporalEcho;
      if (!echo) continue;
      const copies = Math.max(1, Math.min(32, Math.floor(echo.copies)));
      for (let index = copies; index >= 1; index--) {
        result.push({
          ...instance,
          id: `${instance.id}:echo:${index}`,
          name: `${instance.name} echo ${index}`,
          startMs: instance.startMs + index * echo.intervalMs,
          opacity: (instance.opacity ?? 1) * Math.pow(echo.opacityDecay, index),
          repeater: undefined,
          temporalEcho: undefined,
          layout: undefined
        });
      }
    }
  }
  return result;
}

/** Quantize one clip clock while keeping its edit window at full precision. */
export function clipSteppedTime(clip: TimelineClip, timeMs: number): number {
  const fps = clip.steppedTime?.fps;
  if (!fps || !Number.isFinite(fps) || fps <= 0) return timeMs;
  const frameMs = 1000 / fps;
  return clip.startMs + Math.floor((timeMs - clip.startMs) / frameMs) * frameMs;
}
