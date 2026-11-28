/**
 * Region loop ops (CE3, D47): `loop_clip`, and the unroll that split and a
 * start-edge trim run before they edit a looped clip.
 */

import type { serializeClip } from "./serialize.js";
import {
  activeLoopMs,
  loopRepeatCount,
  unrollLoopedClip
} from "../clipLoop.js";
import { barStartMs } from "../midi/grid.js";
import { resolveTempo } from "../midi/tempo.js";
import { sourceRate } from "../sourceRate.js";
import { hasTimeRemap } from "../timeRemap.js";
import type { TimelineClip } from "../types.js";
import type { TimelineOp } from "./op.js";
import type {
  TimelineOpContext,
  TimelineOpResult,
  TimelineOpState
} from "./types.js";

/** What the loop ops use of the op scope. `OpScope` in apply.ts satisfies it. */
export interface LoopScope {
  readonly state: TimelineOpState;
  readonly clips: TimelineClip[];
  readonly ctx: TimelineOpContext;
  resolveClip(target: string): TimelineClip;
  assertWritable(clips: readonly TimelineClip[]): void;
  touch(...ids: string[]): void;
  clipOut(clip: TimelineClip): ReturnType<typeof serializeClip>;
  knownSourceMs?(clip: TimelineClip): Promise<number | undefined>;
}

export async function runLoopClip(
  scope: LoopScope,
  op: Extract<TimelineOp, { op: "loop_clip" }>
): Promise<TimelineOpResult> {
  const clip = scope.resolveClip(op.clip);
  if (clip.mediaType !== "midi" && clip.mediaType !== "audio") {
    throw new Error(
      `Clip "${clip.name}" is a ${clip.mediaType} clip. Only a midi or audio clip loops.`
    );
  }
  scope.assertWritable([clip]);
  const ends = [op.times, op.untilMs, op.untilBar].filter(
    (v) => v !== undefined
  ).length;
  if (ends > 1) {
    throw new Error("Send one of `times`, `untilMs` or `untilBar`, not several.");
  }
  const rate = sourceRate(clip);
  // An imported source of known length cannot be read past its end.
  const knownMs = await scope.knownSourceMs?.(clip);
  const assertWithinSource = (outPointMs: number): void => {
    if (
      clip.sourceType === "imported" &&
      knownMs !== undefined &&
      outPointMs > knownMs + 1e-6
    ) {
      throw new Error(
        `Clip "${clip.name}" has a source of ${knownMs} ms. The loop would read to ${outPointMs} ms. Use a shorter window or length.`
      );
    }
  };

  if (op.loopLengthMs === null) {
    if (ends > 0) {
      throw new Error(
        "`loopLengthMs: null` removes the loop. Do not send `times`, `untilMs` or `untilBar` with it."
      );
    }
    if (clip.mediaType === "audio") {
      const out = (clip.inPointMs ?? 0) + clip.durationMs * rate;
      assertWithinSource(out);
      clip.outPointMs = out;
    }
    delete clip.loopLengthMs;
    scope.touch(clip.id);
    return { ok: true, clip: scope.clipOut(clip), loopRepeats: 1 };
  }

  if (hasTimeRemap(clip)) {
    throw new Error(
      `Clip "${clip.name}" has a time remap, which plays no loop. Clear the remap first.`
    );
  }
  const windowMs = op.loopLengthMs ?? clip.loopLengthMs ?? clip.durationMs;
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new Error("The loop window must be longer than 0 ms.");
  }
  let durationMs = clip.durationMs;
  if (op.times !== undefined) {
    durationMs = windowMs * op.times;
  } else if (op.untilMs !== undefined) {
    durationMs = op.untilMs - clip.startMs;
  } else if (op.untilBar !== undefined) {
    durationMs = barStartMs(op.untilBar, resolveTempo(scope.state)) - clip.startMs;
  } else if (op.loopLengthMs === undefined) {
    throw new Error(
      "Send `times`, `untilMs`, `untilBar` or `loopLengthMs`. Send `loopLengthMs: null` to remove a loop."
    );
  }
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new Error(
      `The loop end must lie after the clip start (${clip.startMs} ms). The result would last ${durationMs} ms.`
    );
  }
  if (clip.mediaType === "audio") {
    assertWithinSource((clip.inPointMs ?? 0) + Math.min(windowMs, durationMs) * rate);
  }
  clip.durationMs = durationMs;
  if (durationMs > windowMs + 1e-6) {
    clip.loopLengthMs = windowMs;
  } else {
    delete clip.loopLengthMs;
  }
  if (clip.mediaType === "audio") {
    // The source window is one repeat; the out-point marks its end.
    clip.outPointMs =
      (clip.inPointMs ?? 0) + Math.min(windowMs, durationMs) * rate;
  }
  scope.touch(clip.id);
  return {
    ok: true,
    clip: scope.clipOut(clip),
    loopRepeats: loopRepeatCount(clip)
  };
}

/**
 * Replace a looped clip in the document with its plain copies, back to back.
 * Returns the copies, or `[clip]` when the clip does not loop. The caller runs
 * inside one op, so the unroll and the edit after it are one undo entry.
 */
export function unrollLoopedInScope(
  scope: LoopScope,
  clip: TimelineClip
): TimelineClip[] {
  const loopMs = activeLoopMs(clip);
  if (loopMs === undefined) return [clip];
  const tempo = resolveTempo(scope.state);
  const copies = unrollLoopedClip(clip, tempo.bpm, loopMs, {
    newId: () => scope.ctx.newId("clip"),
    gridOffsetMs: tempo.offsetMs
  });
  const index = scope.clips.findIndex((c) => c.id === clip.id);
  scope.clips.splice(index, 1, ...copies);
  scope.touch(...copies.map((c) => c.id));
  return copies;
}
