import { compileClipAnimations, sourceRate, type TimelineClip } from "@nodetool-ai/timeline";

/** Sample holds, cut boundaries and authored motion events in timeline time. */
export function storyboardReviewTimes(clips: readonly TimelineClip[], width: number, height: number, fps: number): number[] {
  const times = new Set<number>();
  const frameMs = 1000 / fps;
  for (const clip of clips) {
    if (clip.mediaType === "audio" || clip.durationMs <= 0) { continue; }
    const last = Math.max(0, clip.durationMs - frameMs);
    const add = (local: number): void => { times.add(Math.round(clip.startMs + Math.max(0, Math.min(last, local)))); };
    add(0);
    add(clip.durationMs / 2);
    add(last);
    if (clip.transitionIn) {
      add(clip.transitionIn.durationMs / 2);
      add(clip.transitionIn.durationMs);
    }
    for (const animation of compileClipAnimations(clip.animations, clip.durationMs, { width, height })) {
      const start = animation.windowStartMs;
      const end = animation.loop ? Math.min(animation.windowEndMs, start + (animation.periodMs ?? clip.durationMs)) : animation.windowEndMs;
      add(start);
      add((start + end) / 2);
      add(end);
      for (const curve of animation.curves) {
        for (const keyframe of curve.keyframes) {
          add(animation.timeBase === "source" && keyframe.sourceMs !== undefined
            ? (keyframe.sourceMs - (clip.inPointMs ?? 0)) / sourceRate(clip)
            : start + keyframe.t * (end - start));
        }
      }
    }
  }
  if (times.size > 128) {
    throw new Error(`Visual review requires ${times.size} event frames, exceeding the 128-frame limit. Split the cut or simplify motion before requesting reviewed finishing.`);
  }
  return [...times].sort((left, right) => left - right);
}
