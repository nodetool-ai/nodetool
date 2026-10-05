import { findSystemSkill } from "../../system-skills.js";
import type { ToolLoopEvalCase } from "../tool-loop-eval.js";
import {
  ANIMATION_PRESETS,
  type TimelineClip,
  parseEasing,
  parseStaggerUnit,
  type ClipAnimation
} from "@nodetool-ai/timeline";
import {
  countTextStaggerUnits,
  type RenderCanvas
} from "@nodetool-ai/timeline/scene";
import {
  createTimelineToolBridge,
  type TimelineBridgeFinalState
} from "../../capabilities/timeline-bridge.js";
export * from "../../capabilities/timeline-bridge.js";
export const TIMELINE_READ_ONLY_TOOLS: readonly string[] = [
  "ui_timeline_get_state",
  "ui_timeline_list_animation_presets",
  "ui_timeline_select_clip",
  "ui_timeline_preview_transition_candidate",
  "ui_timeline_seek",
  "preview_timeline_frame"
];

/** Whether the last edit in a transcript is followed by a preview call. */
export function previewedAfterLastEdit(toolLog: readonly string[]): boolean {
  const lastEdit = toolLog.reduce(
    (index, name, i) => (TIMELINE_READ_ONLY_TOOLS.includes(name) ? index : i),
    -1
  );
  if (lastEdit === -1) return false;
  return toolLog.indexOf("preview_timeline_frame", lastEdit + 1) !== -1;
}

/**
 * Whether a preview landed inside a motion rather than beside it.
 *
 * {@link previewedAfterLastEdit} reads the transcript's shape: a preview call
 * came last. That passes on a look at 0ms, where an entrance has not started —
 * the endpoints tell you nothing, which is what the skill's "sample the middle
 * of a motion" is about. This reads the timecodes instead: at least one falls
 * strictly inside the window of an animation the document now carries.
 *
 * Every animation in a graded final state is one the run authored, since the
 * seeded worlds carry none.
 */
export function previewedMidMotion(
  previewTimesMs: readonly number[],
  clips: readonly TimelineClip[],
  canvas: RenderCanvas
): boolean {
  if (previewTimesMs.length === 0) return false;
  return clips.some((clip) =>
    (clip.animations ?? []).some((animation) => {
      const window = animationWindow(clip, animation, canvas);
      if (!(window.endMs > window.startMs)) return false;
      return previewTimesMs.some(
        (timeMs) => timeMs > window.startMs && timeMs < window.endMs
      );
    })
  );
}

/**
 * How long an animation is in motion for: its own window, widened by the
 * stagger's last unit. `durationMs` unset takes the preset's default.
 */
function motionSpanMs(
  clip: TimelineClip,
  animation: ClipAnimation,
  canvas: RenderCanvas
): number {
  const preset = ANIMATION_PRESETS.find((p) => p.id === animation.preset);
  const durationMs = animation.durationMs ?? preset?.defaultDurationMs ?? 0;
  const stagger = animation.stagger;
  if (!stagger || !(stagger.offsetMs > 0)) return durationMs;
  const units = staggerUnitsOf(clip, stagger.unit, canvas);
  if (units < 2) return durationMs;
  return durationMs + stagger.offsetMs * (units - 1);
}

/**
 * When an animation runs, in timeline ms. `delayMs` offsets an `in` and an
 * `emphasis` from the clip's start and an `out` backwards from its end, which
 * is the role rule the skill states. A `loop` runs for the whole clip.
 */
export function animationWindow(
  clip: TimelineClip,
  animation: ClipAnimation,
  canvas: RenderCanvas
): { startMs: number; endMs: number } {
  const clipEndMs = clip.startMs + clip.durationMs;
  if (animation.role === "loop") {
    return { startMs: clip.startMs, endMs: clipEndMs };
  }
  const delayMs = animation.delayMs ?? 0;
  const spanMs = motionSpanMs(clip, animation, canvas);
  if (animation.role === "out") {
    const endMs = clipEndMs - delayMs;
    return { startMs: endMs - spanMs, endMs };
  }
  const startMs = clip.startMs + delayMs;
  return { startMs, endMs: startMs + spanMs };
}

/**
 * Whether a staggered animation finishes inside its clip: the last unit
 * starts `offsetMs × (units − 1)` in and still runs the full `durationMs`.
 * An animation with no stagger, or one on a clip that splits into fewer than
 * two units, fits by construction — it is one block.
 */
export function staggerSpanFitsClip(
  clip: TimelineClip,
  animation: ClipAnimation,
  canvas: RenderCanvas
): boolean {
  const stagger = animation.stagger;
  if (!stagger || !(stagger.offsetMs > 0)) return true;
  const units = staggerUnitsOf(clip, stagger.unit, canvas);
  if (units < 2) return true;
  const preset = ANIMATION_PRESETS.find((p) => p.id === animation.preset);
  const durationMs = animation.durationMs ?? preset?.defaultDurationMs ?? 0;
  const span =
    (animation.delayMs ?? 0) + durationMs + stagger.offsetMs * (units - 1);
  return span <= clip.durationMs;
}

/**
 * How many units a clip's text splits into for a stagger unit. Line counting
 * wraps against the sequence size; with no text measurer every authored
 * paragraph is one line, which is what a headless surface can know.
 */
export function staggerUnitsOf(
  clip: TimelineClip,
  unit: string,
  canvas: RenderCanvas
): number {
  const style = clip.textStyle;
  const parsed = parseStaggerUnit(unit);
  // An unknown unit compiles as a plain block animation, so it splits into
  // nothing — same answer as a clip with no text.
  if (!style || !parsed) return 0;
  return countTextStaggerUnits(style, canvas, parsed);
}

/**
 * The easing an animation actually runs with: its own, else the preset's, else
 * the role default (`in` decelerates, `out` accelerates).
 */
export function effectiveEasing(animation: ClipAnimation): string {
  if (animation.easing) return animation.easing;
  const preset = ANIMATION_PRESETS.find((p) => p.id === animation.preset);
  if (preset?.defaultEasing) return preset.defaultEasing;
  switch (animation.role) {
    case "in":
      return "easeOut";
    case "out":
      return "easeIn";
    case "emphasis":
      return "easeInOut";
    default:
      return "linear";
  }
}

/** How far either side of the curve a slope is measured over. */
const EASING_SLOPE_STEP = 0.02;

/**
 * Whether an easing decelerates into its landing.
 *
 * The `easeOut` family qualifies by name: its endpoints are exact, and
 * `easeOutBounce` deliberately accelerates into its last bounce, which a slope
 * reading at t=1 would score as an ease-in. Everything else in the grammar is
 * measured — the curve's slope entering the landing against its slope leaving
 * the start — so `cubic-bezier(0.16,1,0.3,1)`, the deceleration the skill
 * recommends for entrances, passes and `cubic-bezier(0.7,0,0.84,0)`, the exit
 * curve beside it, does not. An easing outside the grammar eases linearly and
 * does not decelerate.
 */
export function easingDecelerates(easing: string): boolean {
  const text = easing.trim();
  if (/^easeOut/.test(text)) return true;
  const curve = parseEasing(text);
  if (!curve) return false;
  const entry = (curve(EASING_SLOPE_STEP) - curve(0)) / EASING_SLOPE_STEP;
  const landing = (curve(1) - curve(1 - EASING_SLOPE_STEP)) / EASING_SLOPE_STEP;
  return landing < entry;
}

const TIMELINE_SYSTEM_PROMPT = `You are an assistant driving a timeline / video editor through UI tools.

Use the ui_timeline_* tools to inspect and modify the sequence:
- Call ui_timeline_get_state first to see what's already there and get track/clip ids and names.
- Add content with ui_timeline_add_text_clip, ui_timeline_add_shape_clip, or ui_timeline_generate_clip; add tracks with ui_timeline_add_track when needed.
- Address existing clips by id, name, or "selected" with ui_timeline_split_clip, ui_timeline_trim_clip, ui_timeline_move_clip, ui_timeline_delete_clip, ui_timeline_duplicate_clip, ui_timeline_set_clip_params, ui_timeline_set_clip_binding, ui_timeline_set_transition, ui_timeline_set_time_remap, ui_timeline_animate_clip, ui_timeline_clear_animations, ui_timeline_select_clip.
- Use ui_timeline_generatively_edit_clip for a nondestructive video edit. Pass the exact clip_id, an instruction, and an optional provider/model. It captures the clip's playable source window, returns an inactive candidate and generationId, and never changes the active take. After that candidate succeeds, call ui_timeline_apply_take with the same clip_id and the returned take_id to promote it in one undoable action. Do not request extend, object, range, or operation fields: the instruction is the edit target.
- Before animating a clip, call ui_timeline_list_animation_presets to discover the exact preset ids, allowed roles, and params.
- For motion no preset covers, animate with preset "custom" and pass curves — [{property, keyframes: [{t, value}]}], where t runs 0..1 over the animation window. list_animation_presets reports which properties a curve may drive.
- ui_timeline_seek moves the playhead (useful before a playhead-relative split).
- Use ui_timeline_list_tracks to inspect source-time subject tracks. ui_timeline_set_reframe_subject makes one ready track drive a clip's crop; ui_timeline_add_reframe_keyframe adds a manual source-time correction, and ui_timeline_clear_reframe removes only that framing state.
- Generate a selected-cut transition with ui_timeline_generate_transition_at_cut. It returns an inactive cut-level candidate without changing either source clip. Audition it with ui_timeline_preview_transition_candidate, then explicitly apply it with ui_timeline_apply_transition_at_cut and the returned candidate_id. Never use a normal clip take or ordinary built-in transition as the generated result, and re-read state if the cut may have changed.
- ui_timeline_retarget_format creates a new sequence for one target aspect ratio and leaves this sequence unchanged. Run it once per portrait, square, or other adaptation, then continue editing the returned sequence id.
- For a played part: add a midi track, place phrases with ui_timeline_add_midi_clip (notes in ticks from the clip's content start, 960 ticks = a quarter note), rewrite them with ui_timeline_set_notes, pick the synth with ui_timeline_set_track_instrument — either a named voice ({"preset": "bass"}: saw-lead, square-lead, soft-pad, pluck, bass, bell) or every field spelled out — and set the speed once with ui_timeline_set_tempo, which rescales the midi clips and leaves picture and audio where they are.
- Edit a phrase you already placed without resending it: ui_timeline_transpose_clip moves every note by whole semitones, ui_timeline_quantize_notes snaps onsets to a note grid (1/4, 1/8, 1/16, 1/32, 1/8T, 1/16T; strength below 1 keeps some of the feel) and reports how many notes moved, ui_timeline_scale_velocity multiplies how hard they are struck. get_state reports each midi clip's startBarsBeats, so the next phrase goes on a bar line.
- Flag moments with ui_timeline_add_marker / ui_timeline_delete_marker. To cut to music, lay the grid down with ui_timeline_set_markers_from_beats and put clip boundaries on it with ui_timeline_snap_to_beats, then read its per-clip report — a clip further than the tolerance from every beat is left alone and says so.

- Look at what you made with preview_timeline_frame before you stop.

Call one tool at a time and use the result before the next call. When the objective is fully satisfied, STOP calling tools and give a one-line summary.
${motionGraphicsSection()}`;

/**
 * The shipped `motion-graphics` skill, verbatim, plus the two lines that
 * reconcile it with this surface. The eval measures motion the skill teaches,
 * so the model gets the same document a product agent gets rather than a
 * paraphrase that drifts from it. Empty when the build ships no skills —
 * a skill file missing is not a reason to fail every timeline case.
 */
function motionGraphicsSection(): string {
  const skill = findSystemSkill("motion-graphics")?.content;
  if (!skill) return "";
  return `
---

The motion-graphics craft, as shipped. It names the capability tools: read \`get_timeline\` as ui_timeline_get_state and every \`edit_timeline\` op as the matching ui_timeline_* tool. \`preview_timeline_frame\` is here and reports the layer stack rather than pixels.

${skill}`;
}

export const TIMELINE_TOOL_LOOP_CASES: readonly ToolLoopEvalCase<TimelineBridgeFinalState>[] =
  [
    {
      id: "titles-with-motion",
      description: "Add a text clip and give it a fade-in entrance animation",
      objective:
        "Add a text clip that says 'Hello' and give it a fade-in entrance animation.",
      createBridge: () => createTimelineToolBridge(),
      systemPrompt: TIMELINE_SYSTEM_PROMPT,
      expect: {
        requiredTools: [
          "ui_timeline_add_text_clip",
          "ui_timeline_animate_clip"
        ],
        ordering: [["ui_timeline_add_text_clip", "ui_timeline_animate_clip"]],
        noErrorResults: true,
        minToolCalls: 2,
        maxToolCalls: 12,
        finalState: [
          {
            name: "hasAnimatedTextClip",
            detail: "no text clip with an 'in' animation",
            test: (s) =>
              s.clips.some(
                (c) =>
                  c.mediaType === "text" &&
                  c.animations.some((a) => a.role === "in")
              )
          }
        ]
      }
    },
    {
      id: "generate-and-arrange",
      description: "Generate a video clip and move it to a specific start time",
      objective:
        "Add a video track, generate a text-to-video clip on it, then move the clip to start at 2000ms on the timeline.",
      createBridge: () => createTimelineToolBridge(),
      systemPrompt: TIMELINE_SYSTEM_PROMPT,
      expect: {
        requiredTools: ["ui_timeline_generate_clip", "ui_timeline_move_clip"],
        noErrorResults: true,
        minToolCalls: 2,
        maxToolCalls: 12,
        finalState: [
          {
            name: "hasGeneratedVideoClipAt2000",
            detail: "no generated video clip at startMs=2000 with a prompt",
            test: (s) =>
              s.clips.some(
                (c) =>
                  c.mediaType === "video" && c.startMs === 2000 && !!c.prompt
              )
          }
        ]
      }
    },
    {
      id: "cut-and-trim",
      description: "Split a clip and delete the second half",
      objective:
        "The timeline has one video clip named 'shot' running from 0ms to 6000ms. Split it at 3000ms and delete the second half.",
      createBridge: () =>
        createTimelineToolBridge({
          tracks: [{ type: "video" }],
          clips: [
            {
              name: "shot",
              trackIndex: 0,
              mediaType: "video",
              startMs: 0,
              durationMs: 6000
            }
          ]
        }),
      systemPrompt: TIMELINE_SYSTEM_PROMPT,
      userPrompt:
        "Objective: The timeline has one video clip named 'shot' running from 0ms to 6000ms. Split it at 3000ms and delete the second half.",
      expect: {
        requiredTools: ["ui_timeline_split_clip", "ui_timeline_delete_clip"],
        noErrorResults: true,
        minToolCalls: 2,
        maxToolCalls: 12,
        finalState: [
          {
            name: "oneClipLeftAt3000ms",
            detail: "expected exactly 1 clip with durationMs 3000",
            test: (s) => s.clips.length === 1 && s.clips[0].durationMs === 3000
          }
        ]
      }
    },
    {
      id: "keyframed-slide",
      description:
        "Keyframe an entrance with a custom animation instead of a preset",
      objective:
        "Add a text clip that says 'Launch' and give it a keyframed entrance: over the first 800ms it rises 120 pixels into place, from offsetY 120 down to 0. Use a custom animation with explicit keyframes, not a preset.",
      createBridge: () => createTimelineToolBridge(),
      systemPrompt: TIMELINE_SYSTEM_PROMPT,
      expect: {
        requiredTools: [
          "ui_timeline_add_text_clip",
          "ui_timeline_animate_clip"
        ],
        ordering: [["ui_timeline_add_text_clip", "ui_timeline_animate_clip"]],
        noErrorResults: true,
        minToolCalls: 2,
        maxToolCalls: 12,
        finalState: [
          {
            name: "hasCustomOffsetYCurve",
            detail:
              "no text clip carrying a custom 'in' animation whose offsetY curve ends at 0",
            test: (s) =>
              s.documentClips.some((clip) => {
                if (clip.mediaType !== "text") return false;
                const animation = (clip.animations ?? []).find(
                  (a) => a.role === "in" && a.preset === "custom"
                );
                const curve = animation?.custom?.curves.find(
                  (c) => c.property === "offsetY"
                );
                if (!curve) return false;
                const keyframes = curve.keyframes;
                const first = keyframes[0];
                const last = keyframes[keyframes.length - 1];
                // A rise into place: starts below, lands on the layout
                // position, and the window is the 800ms that was asked for.
                return (
                  first.t === 0 &&
                  last.t === 1 &&
                  first.value >= 100 &&
                  last.value === 0 &&
                  animation?.durationMs === 800
                );
              })
          }
        ]
      }
    },
    {
      id: "kinetic-title-staggered",
      description:
        "Stagger a title's words so the entrance still finishes inside the clip",
      objective:
        "Put the title 'MAKE IT MOVE' on screen for 2500ms and have the words arrive one after another instead of all at once. The whole entrance has to be over while the card is still up.",
      createBridge: () => createTimelineToolBridge({ preview: true }),
      systemPrompt: TIMELINE_SYSTEM_PROMPT,
      expect: {
        requiredTools: [
          "ui_timeline_add_text_clip",
          "ui_timeline_animate_clip"
        ],
        ordering: [["ui_timeline_add_text_clip", "ui_timeline_animate_clip"]],
        noErrorResults: true,
        minToolCalls: 2,
        maxToolCalls: 14,
        finalState: [
          {
            name: "staggerSpanFitsTheCard",
            detail:
              "no text clip whose entrance staggers over at least two units and finishes inside the clip",
            test: (s) =>
              s.documentClips.some((clip) => {
                if (clip.mediaType !== "text") return false;
                const entrance = (clip.animations ?? []).find(
                  (a) => a.role === "in" && a.stagger
                );
                const stagger = entrance?.stagger;
                if (!entrance || !stagger) return false;
                return (
                  staggerUnitsOf(clip, stagger.unit, s) >= 2 &&
                  staggerSpanFitsClip(clip, entrance, s)
                );
              })
          }
        ]
      }
    },
    {
      id: "lower-third-layered",
      description:
        "Put a scrim behind a name plate and keep both inside the shot",
      objective:
        "The shot named 'Host' runs from 0ms to 6000ms. While it is on screen, put the name 'Maya Chen' on the picture with a dark bar behind the words so they stay readable against the shot. Both have to sit inside that shot's window.",
      createBridge: () =>
        createTimelineToolBridge({
          preview: true,
          tracks: [{ type: "video", name: "Picture" }],
          clips: [
            {
              name: "Host",
              trackIndex: 0,
              mediaType: "video",
              startMs: 0,
              durationMs: 6000
            }
          ]
        }),
      systemPrompt: TIMELINE_SYSTEM_PROMPT,
      expect: {
        requiredTools: [
          "ui_timeline_add_text_clip",
          "ui_timeline_add_shape_clip"
        ],
        noErrorResults: true,
        minToolCalls: 2,
        maxToolCalls: 14,
        finalState: [
          {
            name: "scrimBehindTextInsideTheShot",
            detail:
              "no shape clip drawn over the picture and under the text, sharing frames with it inside 0-6000ms",
            test: (s) => {
              const indexOf = (trackId: string): number =>
                s.tracks.find((t) => t.id === trackId)?.index ?? -1;
              const inShot = (c: { startMs: number; durationMs: number }) =>
                c.startMs >= 0 && c.startMs + c.durationMs <= 6000;
              const overlaps = (
                a: { startMs: number; durationMs: number },
                b: { startMs: number; durationMs: number }
              ) =>
                a.startMs < b.startMs + b.durationMs &&
                b.startMs < a.startMs + a.durationMs;
              const texts = s.clips.filter(
                (c) => c.mediaType === "text" && inShot(c)
              );
              const shapes = s.clips.filter(
                (c) => c.mediaType === "shape" && inShot(c)
              );
              const picture = s.clips.filter((c) => c.mediaType === "video");
              // Lowest index draws on top, so the scrim sits between the two:
              // over the shot it darkens, under the words it backs. A scrim
              // that never shares a frame with the text backs nothing.
              return texts.some((text) =>
                shapes.some(
                  (shape) =>
                    indexOf(shape.trackId) > indexOf(text.trackId) &&
                    overlaps(shape, text) &&
                    picture.some(
                      (shot) => indexOf(shot.trackId) > indexOf(shape.trackId)
                    )
                )
              );
            }
          }
        ]
      }
    },
    {
      id: "entrance-decelerates",
      description: "Every entrance eases out or springs, never accelerates in",
      objective:
        "Add two title cards, 'Chapter One' and 'Chapter Two', and bring each one on so it arrives and settles rather than speeding up as it lands.",
      createBridge: () => createTimelineToolBridge({ preview: true }),
      systemPrompt: TIMELINE_SYSTEM_PROMPT,
      expect: {
        requiredTools: ["ui_timeline_animate_clip"],
        noErrorResults: true,
        minToolCalls: 2,
        maxToolCalls: 16,
        finalState: [
          {
            name: "everyEntranceDecelerates",
            detail:
              "an 'in' animation runs on an easing that is neither an ease-out family nor a spring",
            test: (s) => {
              const entrances = s.documentClips.flatMap((clip) =>
                (clip.animations ?? []).filter((a) => a.role === "in")
              );
              return (
                entrances.length >= 2 &&
                entrances.every((a) => easingDecelerates(effectiveEasing(a)))
              );
            }
          }
        ]
      }
    },
    {
      id: "beat-cut",
      description: "Move every picture boundary onto a named musical onset",
      objective:
        "The music hits at 0ms, 2000ms, 4000ms and 6000ms. My three shots — A, B and C — are roughly laid out and none of the cuts land on those hits. Put every cut on a hit, keeping the shots back to back with no gap.",
      createBridge: () =>
        createTimelineToolBridge({
          preview: true,
          tracks: [{ type: "video", name: "Picture" }],
          clips: [
            {
              name: "A",
              trackIndex: 0,
              mediaType: "video",
              startMs: 0,
              durationMs: 2180
            },
            {
              name: "B",
              trackIndex: 0,
              mediaType: "video",
              startMs: 2180,
              durationMs: 2080
            },
            {
              name: "C",
              trackIndex: 0,
              mediaType: "video",
              startMs: 4260,
              durationMs: 1740
            }
          ]
        }),
      systemPrompt: TIMELINE_SYSTEM_PROMPT,
      expect: {
        noErrorResults: true,
        minToolCalls: 1,
        maxToolCalls: 16,
        finalState: [
          {
            name: "everyBoundaryOnAnOnset",
            detail:
              "a picture clip's start or end is further than 60ms from 0/2000/4000/6000ms",
            test: (s) => {
              const onsets = [0, 2000, 4000, 6000];
              const onBeat = (ms: number) =>
                onsets.some((onset) => Math.abs(ms - onset) <= 60);
              const picture = s.clips.filter((c) => c.mediaType === "video");
              return (
                picture.length === 3 &&
                picture.every(
                  (c) => onBeat(c.startMs) && onBeat(c.startMs + c.durationMs)
                )
              );
            }
          }
        ]
      }
    },
    {
      id: "looked-before-done",
      description: "Check the frame after the last edit, before reporting done",
      objective:
        "Add an end card that says 'END' starting at 4000ms, then look at what is actually on screen there before you tell me it is finished.",
      createBridge: () => createTimelineToolBridge({ preview: true }),
      systemPrompt: TIMELINE_SYSTEM_PROMPT,
      expect: {
        requiredTools: ["ui_timeline_add_text_clip", "preview_timeline_frame"],
        noErrorResults: true,
        minToolCalls: 2,
        maxToolCalls: 12,
        finalState: [
          {
            name: "previewedAfterTheLastEdit",
            detail:
              "the run's last edit is not followed by a preview_timeline_frame call",
            test: (s) =>
              s.clips.some((c) => c.mediaType === "text") &&
              previewedAfterLastEdit(s.toolLog) &&
              previewedMidMotion(s.previewTimesMs, s.documentClips, s)
          }
        ]
      }
    },
    {
      id: "video-flow-plan-then-generate",
      description:
        "Plan a video's beats, then cut it — the guided flow through the tools",
      objective:
        "This is a 15-second ad for a paper boat. Write the brief onto the sequence, plan four beats — the second and fourth each carry a voiceover line — then generate the video from that plan with model 'nodetool/kling-turbo' and voice 'alloy'.",
      createBridge: () => createTimelineToolBridge(),
      systemPrompt: TIMELINE_SYSTEM_PROMPT,
      expect: {
        requiredTools: [
          "ui_timeline_plan_beats",
          "ui_timeline_generate_from_beats"
        ],
        noErrorResults: true,
        minToolCalls: 2,
        maxToolCalls: 12,
        finalState: [
          {
            name: "onePictureClipPerBeat",
            detail:
              "the picture track does not hold exactly one clip per planned beat",
            test: (s) =>
              (s.setup?.beats?.length ?? 0) > 0 &&
              s.clips.filter((c) => c.mediaType === "video").length ===
                (s.setup?.beats?.length ?? 0)
          },
          {
            name: "oneVoiceoverClipPerVoicedBeat",
            detail:
              "the voiceover clips do not match the beats that carry a line",
            test: (s) => {
              const voiced = (s.setup?.beats ?? []).filter(
                (beat) => (beat.voiceover ?? "").trim().length > 0
              ).length;
              const audio = s.documentClips.filter(
                (c) => c.bindingKind === "text-to-audio" && c.beatId
              ).length;
              return voiced > 0 && audio === voiced;
            }
          },
          {
            name: "flowFinished",
            detail: "the flow's stage is not done after generating",
            test: (s) => s.setup?.stage === "done"
          }
        ]
      }
    },
    {
      id: "three-d-turntable",
      description: "Put a glTF on the timeline, spin its camera, then look",
      objective:
        "Put the 3D model asset 'asset_lantern_glb' on an overlay track for 4 seconds, make its camera go all the way round the model over that time, and then look at the frame in the middle to check the model is actually on screen.",
      createBridge: () => createTimelineToolBridge({ preview: true }),
      systemPrompt: TIMELINE_SYSTEM_PROMPT,
      expect: {
        requiredTools: [
          "ui_timeline_add_model3d_clip",
          "ui_timeline_animate_clip",
          "preview_timeline_frame"
        ],
        noErrorResults: true,
        minToolCalls: 3,
        maxToolCalls: 14,
        finalState: [
          {
            name: "modelClipCarriesAnOrbit",
            detail:
              "no model3d clip holding the asset with a loop animation driving its camera",
            test: (s) =>
              s.documentClips.some(
                (clip) =>
                  clip.mediaType === "model3d" &&
                  clip.currentAssetId === "asset_lantern_glb" &&
                  clip.model3dStyle !== undefined &&
                  (clip.animations ?? []).some((a) => a.role === "loop")
              )
          },
          {
            // The document can say a 3D clip exists; only the report says one
            // was drawn — which is the whole point of looking before stopping.
            name: "previewReportedTheModel",
            detail: "no preview reported a model3d layer",
            test: (s) => s.previewedLayerKinds.includes("model3d")
          }
        ]
      }
    },
    {
      id: "trimmed-video-edit-candidate-apply",
      description:
        "Edit a trimmed source into an inactive candidate, inspect it, then apply it",
      objective:
        "The timeline contains a trimmed imported video clip. Edit that exact clip to make the station deserted at night, inspect the inactive candidate, then explicitly apply the returned take while keeping the current cut.",
      createBridge: () =>
        createTimelineToolBridge({
          sequenceId: "sequence-trimmed-edit",
          sequence: {
            tracks: [
              {
                id: "track-video",
                name: "Video",
                type: "video",
                index: 0,
                visible: true,
                locked: false
              }
            ],
            clips: [
              {
                id: "clip-trimmed",
                trackId: "track-video",
                name: "Station",
                startMs: 1200,
                durationMs: 4000,
                inPointMs: 40000,
                outPointMs: 44000,
                mediaType: "video",
                sourceType: "imported",
                status: "generated",
                locked: false,
                currentAssetId: "asset-original",
                activeTakeId: "take-original",
                versions: [
                  {
                    id: "take-original",
                    createdAt: "2026-01-01T00:00:00.000Z",
                    workflowUpdatedAt: "2026-01-01T00:00:00.000Z",
                    jobId: "original-job",
                    assetId: "asset-original",
                    dependencyHash: "",
                    paramOverridesSnapshot: {},
                    durationMs: 4000,
                    status: "success",
                    source: "imported",
                    sourceMapping: {
                      inPointMs: 40000,
                      outPointMs: 44000,
                      speedMultiplier: 1,
                      speedBaked: false
                    }
                  }
                ]
              }
            ]
          }
        }),
      systemPrompt: TIMELINE_SYSTEM_PROMPT,
      expect: {
        requiredTools: [
          "ui_timeline_generatively_edit_clip",
          "ui_timeline_list_takes",
          "ui_timeline_apply_take"
        ],
        ordering: [
          ["ui_timeline_generatively_edit_clip", "ui_timeline_list_takes"],
          ["ui_timeline_list_takes", "ui_timeline_apply_take"]
        ],
        noErrorResults: true,
        minToolCalls: 3,
        maxToolCalls: 8,
        finalState: [
          {
            name: "appliedEditPreservesTheTimelineCut",
            detail:
              "the edit candidate was not applied to the trimmed clip with its timeline placement intact",
            test: (s) => {
              const clip = s.documentClips.find(
                (candidate) => candidate.id === "clip-trimmed"
              );
              const active = clip?.versions?.find(
                (take) => take.id === clip.activeTakeId
              );
              return (
                clip?.startMs === 1200 &&
                clip.durationMs === 4000 &&
                clip.currentAssetId?.startsWith(
                  "generative://clip-trimmed/"
                ) === true &&
                clip.inPointMs === 0 &&
                clip.outPointMs === 4000 &&
                active?.mediaEdit?.sourceContext.sourceStartMs === 40000 &&
                active.mediaEdit.sourceContext.sourceEndMs === 44000
              );
            }
          }
        ]
      }
    }
  ];
