/**
 * planBeats — the video flow's step 2 planner (PRD § 8.2, D20).
 *
 * D20: no second planner for video. A beat is a direct-mode shot without a
 * still, so this runs the same Director that writes a storyboard's screenplay
 * and composes each beat's prompt through the same `shot-prompt` module. A
 * board and a timeline built from the same brief therefore send the same words
 * to the same model, and the two flows cannot drift apart in what they ask for.
 *
 * D4: this is the cheap step. It returns text and writes it onto the sequence's
 * `setup.beats`. It creates no clip, enqueues no job, and issues exactly one
 * RPC — `generate_text`. Nothing costs a render until `generateFromBeats` runs.
 */

import { useCallback, useState } from "react";
import {
  DIRECTOR_SYSTEM_PROMPT,
  SCREENPLAY_TOOL_DESCRIPTION,
  SCREENPLAY_TOOL_NAME,
  buildDirectorPrompt,
  buildScreenplaySchema,
  clampShotCount,
  directClipPrompt,
  fallbackScreenplay,
  parseScreenplay,
  sceneForShot
} from "@nodetool-ai/protocol";
import type { Screenplay, Shot } from "@nodetool-ai/protocol";
import type { TimelineBeat } from "@nodetool-ai/timeline";
import { createTimeOrderedUuid } from "@nodetool-ai/timeline";

import { rpcRequest } from "../../lib/websocket/rpcRequest";
import {
  useTimelineStoreApi,
  type TimelineStoreApi
} from "../../stores/timeline/TimelineStore";
import { STUDIO_DIRECTOR_MODEL } from "../../studio/curatedModels";
import {
  defaultBeatDurationMs,
  videoFormatById,
  type VideoFormat
} from "../../components/setup/video/formats";

/** What asks the model. Injectable so the planner is testable without a socket. */
export type PlanRequest = (
  command: string,
  data: Record<string, unknown>
) => Promise<Record<string, unknown>>;

export interface PlanBeatsOptions {
  brief: string;
  format: VideoFormat;
  /** The Director's model. Studio pins it; a host may pass its own. */
  model?: { id: string; provider: string };
  /**
   * The plan already on the sequence. `Re-plan` sends it back as context, so a
   * second run rewrites what the creator edited rather than ignoring it.
   */
  previous?: readonly TimelineBeat[];
  request?: PlanRequest;
}

/** A beat's spoken line, or nothing when the format has no voice lane. */
const voiceoverFor = (shot: Shot, format: VideoFormat): string | undefined => {
  if (!format.tracks.some((track) => track.name === "Voiceover")) {
    return undefined;
  }
  const line = (shot.narration ?? shot.dialogue ?? "").trim();
  return line.length > 0 ? line : undefined;
};

/**
 * One shot → one beat. The prompt is the direct-mode composition: there is no
 * still to carry framing, lighting and style into the render, so the beat
 * prompt carries all of it (`shot-prompt`, PRD § 7.7.5).
 */
const beatFromShot = (
  shot: Shot,
  screenplay: Screenplay,
  format: VideoFormat,
  wantsMusic: boolean
): TimelineBeat => {
  const seconds = shot.duration_seconds;
  return {
    id: createTimeOrderedUuid(),
    prompt: directClipPrompt(shot, {
      scene: sceneForShot(shot, screenplay.scenes),
      style: screenplay.style_bible
    }),
    duration_ms:
      typeof seconds === "number" && seconds > 0
        ? Math.round(seconds * 1000)
        : defaultBeatDurationMs(format),
    // The Director writes no transitions, and inventing one per beat would put
    // a directorial choice in the plan that nobody made. A beat with none is a
    // straight cut; the review is where a creator asks for a dissolve.
    voiceover: voiceoverFor(shot, format),
    music: wantsMusic
  };
};

/** The context line a re-plan carries: what the creator had, in their edits. */
const previousPlanNote = (previous: readonly TimelineBeat[]): string =>
  [
    "",
    "The current plan, as the creator has edited it — keep what works and fix what does not:",
    ...previous.map(
      (beat, index) =>
        `${index + 1}. (${Math.round(beat.duration_ms / 1000)}s) ${beat.prompt}` +
        (beat.voiceover ? ` — voiceover: ${beat.voiceover}` : "")
    )
  ].join("\n");

/**
 * Draft the beat list. Returns the beats; writing them onto the sequence is
 * {@link applyBeatPlan}'s job, so a caller can review the result before it
 * touches a document.
 */
export async function planBeats({
  brief,
  format,
  model = STUDIO_DIRECTOR_MODEL,
  previous,
  request = rpcRequest
}: PlanBeatsOptions): Promise<TimelineBeat[]> {
  const trimmed = brief.trim();
  if (trimmed.length === 0) {
    throw new Error("Write what the video is before planning the beats.");
  }
  const shotCount = clampShotCount(format.beatCount);
  const directedBrief =
    previous && previous.length > 0
      ? `${trimmed}\n${previousPlanNote(previous)}`
      : trimmed;

  const result = await request("generate_text", {
    provider: model.provider,
    model: model.id,
    system: DIRECTOR_SYSTEM_PROMPT,
    prompt: buildDirectorPrompt(
      directedBrief,
      "",
      shotCount,
      format.aspectRatio,
      ""
    ),
    max_tokens: 8192,
    schema: buildScreenplaySchema(shotCount),
    schema_name: SCREENPLAY_TOOL_NAME,
    schema_description: SCREENPLAY_TOOL_DESCRIPTION
  });

  const parsed = result["data"]
    ? parseScreenplay(result["data"], {
        shotCount,
        aspectRatio: format.aspectRatio
      })
    : null;
  // A provider without structured output, or the fake one, still leaves the
  // creator with an editable plan — the same rule the Director node applies.
  const screenplay =
    parsed && parsed.shots.length > 0
      ? parsed
      : fallbackScreenplay({
          brief: trimmed,
          style: "",
          shotCount,
          aspectRatio: format.aspectRatio
        });
  const wantsMusic = format.tracks.some((track) => track.name === "Music");
  return screenplay.shots.map((shot) =>
    beatFromShot(shot, screenplay, format, wantsMusic)
  );
}

/** Write a drafted plan onto the sequence and stop at the review (PRD § 8.2). */
export function applyBeatPlan(
  store: TimelineStoreApi,
  beats: readonly TimelineBeat[]
): void {
  store.getState().setSetup({ beats: [...beats], stage: "review" });
}

export interface UsePlanBeatsResult {
  /** Draft and apply, reading the brief and format off the sequence. */
  plan: (options?: { replan?: boolean }) => Promise<void>;
  planning: boolean;
  error: string | null;
}

export function usePlanBeats(): UsePlanBeatsResult {
  const store = useTimelineStoreApi();
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plan = useCallback(
    async ({ replan = false }: { replan?: boolean } = {}) => {
      const setup = store.getState().setup;
      const format = videoFormatById(setup?.format);
      if (!format) {
        const message = "Choose a format before planning the beats.";
        setError(message);
        throw new Error(message);
      }
      setError(null);
      setPlanning(true);
      try {
        const beats = await planBeats({
          brief: setup?.brief ?? "",
          format,
          previous: replan ? setup?.beats : undefined
        });
        applyBeatPlan(store, beats);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        throw cause;
      } finally {
        setPlanning(false);
      }
    },
    [store]
  );

  return { plan, planning, error };
}

export default usePlanBeats;
