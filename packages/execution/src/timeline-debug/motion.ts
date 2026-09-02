/**
 * Motion checks: what the animation compiler quietly does to a clip whose
 * authored motion does not fit it, and what the sampler quietly discards when
 * two animations drive the same absolute channel.
 *
 * Everything here reads the compiler's own output (`compileClipAnimations`)
 * rather than restating its window math, so a rule change in
 * `packages/timeline/src/animation/compile.ts` moves these findings with it. A
 * document whose animations all fit produces nothing.
 */
import type { TimelineClip } from "@nodetool-ai/protocol/api-schemas/timeline.js";
import {
  ANIMATED_PROPERTY_FOLD,
  CUSTOM_ANIMATION_PRESET_ID,
  compileClipAnimations,
  getAnimationPreset,
  normalizeCustomCurves,
  resolveCustomMask,
  type Canvas,
  type ClipAnimation,
  type CompiledAnimation
} from "@nodetool-ai/timeline";
import { clipStaggerCount } from "@nodetool-ai/timeline/scene";

import type { TimelineDebugIssue } from "./types.js";

/** Sub-millisecond slack, so float window math is not reported as a clamp. */
const EPSILON_MS = 0.5;

const clipLabel = (clip: TimelineClip): string => `${clip.name || clip.id}`;

/**
 * The animations the compiler would actually compile.
 *
 * An unknown preset, a role the preset does not offer and unusable baked curves
 * are all reported by their own codes (`unknown_animation_preset`,
 * `custom_animation_invalid`), and compiling them would additionally print a
 * console warning from inside the engine — noise on a CLI run that has already
 * named the problem. Filtering here keeps one finding per defect.
 */
function compilableAnimations(clip: TimelineClip): ClipAnimation[] {
  const out: ClipAnimation[] = [];
  for (const animation of clip.animations ?? []) {
    if (animation.enabled === false) continue;
    if (animation.preset === CUSTOM_ANIMATION_PRESET_ID) {
      const baked = normalizeCustomCurves(animation.custom?.curves);
      if (!baked.ok) continue;
      if (!resolveCustomMask(baked.curves, animation.custom?.mask).ok) continue;
      out.push(animation);
      continue;
    }
    const preset = getAnimationPreset(animation.preset);
    if (!preset || !preset.roles.includes(animation.role)) continue;
    out.push(animation);
  }
  return out;
}

/**
 * Window an animation's replace channels actually hold, in clip-local ms.
 *
 * `holdBefore` (an `"in"`) pins the t=0 value from clip start and `holdAfter`
 * (an `"out"`) pins t=1 to clip end, so the interval a replace channel occupies
 * is wider than the window the motion runs in — which is exactly where two
 * animations end up fighting over one channel without overlapping visibly.
 */
interface HeldInterval {
  fromMs: number;
  toMs: number;
}

function heldInterval(
  compiled: CompiledAnimation,
  clipDurationMs: number
): HeldInterval {
  return {
    fromMs: compiled.holdBefore ? 0 : compiled.windowStartMs,
    toMs: compiled.holdAfter ? clipDurationMs : compiled.windowEndMs
  };
}

/** One animation's claim on one `replace` channel, over the span it holds it. */
interface ReplaceClaim extends HeldInterval {
  id: string;
}

/**
 * Two animations driving one `replace` channel over the same instants (I3).
 *
 * `positionX/Y`, `anchorX/Y` and `trimStart/End` set an absolute value instead
 * of composing, so the last enabled animation in document order wins and the
 * other's curve is discarded — silently, and only where they overlap, which is
 * why this is a warning rather than something a preview would reveal.
 */
function replaceOverlapIssues(
  clip: TimelineClip,
  compiled: CompiledAnimation[]
): TimelineDebugIssue[] {
  const byChannel = new Map<string, ReplaceClaim[]>();
  for (const animation of compiled) {
    const interval = heldInterval(animation, clip.durationMs);
    const claimed = new Set<string>();
    for (const curve of animation.curves) {
      if (ANIMATED_PROPERTY_FOLD[curve.property] !== "replace") continue;
      if (claimed.has(curve.property)) continue;
      claimed.add(curve.property);
      const list = byChannel.get(curve.property);
      const entry = { id: animation.id, ...interval };
      if (list) list.push(entry);
      else byChannel.set(curve.property, [entry]);
    }
  }

  const issues: TimelineDebugIssue[] = [];
  for (const [channel, entries] of byChannel) {
    for (let i = 0; i < entries.length - 1; i += 1) {
      for (let j = i + 1; j < entries.length; j += 1) {
        const a = entries[i]!;
        const b = entries[j]!;
        const fromMs = Math.max(a.fromMs, b.fromMs);
        const toMs = Math.min(a.toMs, b.toMs);
        if (toMs - fromMs <= EPSILON_MS) continue;
        issues.push({
          severity: "warning",
          code: "replace_curves_overlap",
          message: `Clip "${clipLabel(clip)}" animations "${a.id}" and "${b.id}" both drive ${channel} between ${Math.round(fromMs)}ms and ${Math.round(toMs)}ms — ${channel} replaces rather than composes, so the last enabled animation in document order wins and the other's curve is discarded over that span.`,
          path: "animations[*]",
          clipId: clip.id,
          trackId: clip.trackId
        });
      }
    }
  }
  return issues;
}

/**
 * Motion the clip cannot hold.
 *
 * The compiler clamps a window to the clip and drops one that starts at or
 * after clip end, so an entrance authored longer than its clip plays truncated
 * — or never — with nothing said. Both are warnings: the clip still renders,
 * it just does not perform the motion that was written.
 *
 * A `fullClip` preset (`kenBurns`) ignores duration and delay by design and is
 * skipped. A `"loop"` runs to clip end by construction, so only a delay past
 * the clip's end can drop it, which the dropped branch covers.
 */
function windowIssues(
  clip: TimelineClip,
  animations: ClipAnimation[],
  compiled: CompiledAnimation[]
): TimelineDebugIssue[] {
  const byId = new Map(compiled.map((entry) => [entry.id, entry]));
  const issues: TimelineDebugIssue[] = [];
  const at = { clipId: clip.id, trackId: clip.trackId, path: "animations[*]" };

  for (const animation of animations) {
    if (getAnimationPreset(animation.preset)?.fullClip === true) continue;
    const delayMs = Math.max(0, animation.delayMs ?? 0);
    const durationMs = Math.max(1, animation.durationMs);
    const entry = byId.get(animation.id);

    if (!entry) {
      issues.push({
        severity: "warning",
        code: "animation_exceeds_clip",
        message: `Clip "${clipLabel(clip)}" animation "${animation.id}" (${animation.preset}, ${animation.role}) asks for ${durationMs}ms after a ${delayMs}ms delay on a ${clip.durationMs}ms clip — the window falls outside the clip, so the animation never runs.`,
        ...at
      });
      continue;
    }
    if (animation.role === "loop") continue;

    const requestedMs = durationMs + (entry.stagger?.maxDelayMs ?? 0);
    const actualMs = entry.windowEndMs - entry.windowStartMs;
    if (actualMs + EPSILON_MS >= requestedMs) continue;
    issues.push({
      severity: "warning",
      code: "animation_exceeds_clip",
      message: `Clip "${clipLabel(clip)}" animation "${animation.id}" (${animation.preset}, ${animation.role}) needs ${Math.round(requestedMs)}ms after a ${delayMs}ms delay but the ${clip.durationMs}ms clip leaves ${Math.round(actualMs)}ms — the window is clamped, so the motion is cut short.`,
      ...at
    });
  }
  return issues;
}

/**
 * A stagger whose span did not fit the clip.
 *
 * When the units cannot all animate at the authored `offsetMs` the compiler
 * shrinks the offset rather than the per-unit duration, so every unit still
 * completes and the effect reads faster and flatter than it was written —
 * `compressed` on the compiled stagger is the compiler saying so (T8).
 */
function staggerIssues(
  clip: TimelineClip,
  compiled: CompiledAnimation[]
): TimelineDebugIssue[] {
  const issues: TimelineDebugIssue[] = [];
  for (const entry of compiled) {
    const stagger = entry.stagger;
    if (!stagger?.compressed) continue;
    issues.push({
      severity: "warning",
      code: "stagger_compressed",
      message: `Clip "${clipLabel(clip)}" animation "${entry.id}" staggers ${stagger.count} ${stagger.unit}(s) over a ${clip.durationMs}ms clip — the per-unit offset was shrunk to ${Math.round(stagger.offsetMs)}ms to make them fit, so the units overlap more than authored. Lengthen the clip or shorten the animation.`,
      path: "animations[*].stagger.offsetMs",
      clipId: clip.id,
      trackId: clip.trackId
    });
  }
  return issues;
}

/**
 * `timeRemap.keyframes` must ascend in `t` (D13). `sourceMs` may descend —
 * that is reverse playback — but a `t` that repeats or goes backwards makes the
 * piecewise evaluation ambiguous: the source time for an instant depends on
 * which segment is asked, so the clip decodes from somewhere nobody chose. An
 * error, because unlike a mask or a transition there is no sane thing to draw
 * instead.
 */
function timeRemapIssues(clip: TimelineClip): TimelineDebugIssue[] {
  const keyframes = clip.timeRemap?.keyframes;
  if (!keyframes || keyframes.length < 2) return [];
  const issues: TimelineDebugIssue[] = [];
  for (let i = 1; i < keyframes.length; i += 1) {
    const previous = keyframes[i - 1]!;
    const current = keyframes[i]!;
    if (current.t > previous.t) continue;
    issues.push({
      severity: "error",
      code: "time_remap_not_monotonic",
      message: `Clip "${clipLabel(clip)}" remaps time with keyframe ${i} at t=${current.t}, at or before keyframe ${i - 1} at t=${previous.t} — \`t\` must ascend. \`sourceMs\` may descend, which is how a reverse is written.`,
      path: `timeRemap.keyframes[${i}].t`,
      clipId: clip.id,
      trackId: clip.trackId
    });
    break;
  }
  return issues;
}

/**
 * Every motion finding for one clip. `canvas` is the sequence's pixel size,
 * which the compiler needs to resolve a preset's normalized distances and to
 * count the wrapped lines of a `"line"` stagger.
 */
export function checkClipMotion(
  clip: TimelineClip,
  canvas: Canvas
): TimelineDebugIssue[] {
  const issues = timeRemapIssues(clip);
  const animations = compilableAnimations(clip);
  if (animations.length === 0) return issues;

  const { unit: staggerUnit, count: staggerCount } = clipStaggerCount(
    clip,
    canvas
  );
  const compiled = compileClipAnimations(
    animations,
    clip.durationMs,
    canvas,
    { staggerCount, staggerUnit }
  );

  issues.push(
    ...windowIssues(clip, animations, compiled),
    ...staggerIssues(clip, compiled),
    ...replaceOverlapIssues(clip, compiled)
  );
  return issues;
}
