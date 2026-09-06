/**
 * The seven format cards of the video flow's step 2 (PRD § 8.2).
 *
 * A format is the whole frame decision in one click: how long the piece runs,
 * what shape it is, how many beats that length wants, and which tracks the cut
 * is laid on. A beginner picking "15s ad" should not then be asked for a
 * resolution, a frame rate and a track layout — those are consequences of the
 * choice, and they live here so the flow, the tools and the tests read the same
 * numbers.
 *
 * Beat counts are the length divided by a comfortable shot: about 3 seconds for
 * an ad, longer where the picture is meant to sit. They are what the Director is
 * asked for, not a cap — the creator edits the plan afterwards (D4).
 */

import { makeTrack } from "@nodetool-ai/timeline";
import type { TimelineSequence, TimelineTrack } from "@nodetool-ai/timeline";

/** The lanes a format lays down, in order. */
export interface VideoFormatTrack {
  type: TimelineTrack["type"];
  name: string;
}

export interface VideoFormat {
  id: string;
  /** Card title, e.g. "15s ad". */
  title: string;
  /** One line under the title. */
  description: string;
  durationMs: number;
  width: number;
  height: number;
  fps: number;
  /** `"16:9"` — what the look step offers as the starting aspect. */
  aspectRatio: string;
  /** How many beats the Director is asked for. */
  beatCount: number;
  tracks: readonly VideoFormatTrack[];
}

/** Picture, voice and music — the layout every spoken format shares. */
const VOICED_TRACKS: readonly VideoFormatTrack[] = [
  { type: "video", name: "Video" },
  { type: "audio", name: "Voiceover" },
  { type: "audio", name: "Music" }
];

/** Picture and music, for the formats nobody speaks over. */
const SCORED_TRACKS: readonly VideoFormatTrack[] = [
  { type: "video", name: "Video" },
  { type: "audio", name: "Music" }
];

export const VIDEO_FORMATS: readonly VideoFormat[] = [
  {
    id: "ad-15",
    title: "15s ad",
    description: "One idea, one product, out before anyone scrolls.",
    durationMs: 15_000,
    width: 1920,
    height: 1080,
    fps: 30,
    aspectRatio: "16:9",
    beatCount: 5,
    tracks: VOICED_TRACKS
  },
  {
    id: "spot-30",
    title: "30s spot",
    description: "Room for a turn: setup, product, payoff.",
    durationMs: 30_000,
    width: 1920,
    height: 1080,
    fps: 30,
    aspectRatio: "16:9",
    beatCount: 8,
    tracks: VOICED_TRACKS
  },
  {
    id: "explainer-60",
    title: "60s explainer",
    description: "A narrated minute that teaches one thing.",
    durationMs: 60_000,
    width: 1920,
    height: 1080,
    fps: 30,
    aspectRatio: "16:9",
    beatCount: 12,
    tracks: VOICED_TRACKS
  },
  {
    id: "social-9x16",
    title: "9:16 social clip",
    description: "Vertical, fast, built for a phone held upright.",
    durationMs: 20_000,
    width: 1080,
    height: 1920,
    fps: 30,
    aspectRatio: "9:16",
    beatCount: 6,
    tracks: VOICED_TRACKS
  },
  {
    id: "trailer",
    title: "Trailer",
    description: "Cut to a rising score, ending on a title.",
    durationMs: 45_000,
    width: 1920,
    height: 1080,
    fps: 24,
    aspectRatio: "16:9",
    beatCount: 10,
    tracks: SCORED_TRACKS
  },
  {
    id: "music-video",
    title: "Music video",
    description: "Pictures carried by the track, no narration.",
    durationMs: 60_000,
    width: 1920,
    height: 1080,
    fps: 24,
    aspectRatio: "16:9",
    beatCount: 10,
    tracks: SCORED_TRACKS
  },
  {
    id: "slideshow",
    title: "Slideshow",
    description: "Held frames with a line read over each.",
    durationMs: 40_000,
    width: 1920,
    height: 1080,
    fps: 30,
    aspectRatio: "16:9",
    beatCount: 8,
    tracks: VOICED_TRACKS
  }
];

export const videoFormatById = (id: string | undefined): VideoFormat | null =>
  VIDEO_FORMATS.find((format) => format.id === id) ?? null;

/** The beat length a format's plan starts from, before the creator edits it. */
export const defaultBeatDurationMs = (format: VideoFormat): number =>
  Math.round(format.durationMs / format.beatCount);

/**
 * The tracks a format lays down, indexed in declaration order. Separate from
 * {@link emptySequenceForFormat} because applying a format to a sequence that
 * already holds dropped media adds the lanes without replacing the document.
 */
export const tracksForFormat = (format: VideoFormat): TimelineTrack[] =>
  format.tracks.map((track, index) =>
    makeTrack({ type: track.type, name: track.name, index })
  );

/**
 * The sequence a format describes, with nothing on it yet. The flow writes one
 * of these when the creator picks a card, and the format test parses it against
 * the wire schema — a card whose numbers the server would refuse is a card that
 * fails at the worst possible moment, three steps later.
 */
export function emptySequenceForFormat(
  format: VideoFormat,
  sequence: Pick<TimelineSequence, "id" | "projectId" | "name">
): TimelineSequence {
  const now = new Date().toISOString();
  return {
    ...sequence,
    fps: format.fps,
    width: format.width,
    height: format.height,
    durationMs: format.durationMs,
    tracks: tracksForFormat(format),
    clips: [],
    markers: [],
    createdAt: now,
    updatedAt: now
  };
}
