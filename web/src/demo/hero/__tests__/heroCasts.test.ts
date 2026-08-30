/**
 * The hero reel is the first thing on the landing page and it plays with no
 * sound and no controls, so a cast that drifts shows up as a confusing loop
 * rather than as an error. These pin the one thing the reel actually claims:
 * that the six shots are the *same* six all the way through — described in
 * chat, boarded, rendered, and cut — and that each stage still ends where the
 * next one picks up.
 */
import { chatCasts } from "../../chat/casts";
import { docCasts } from "../../doc/casts";
import { timelineCasts } from "../../timeline/casts";
import { computeChatStateAt } from "../../chat/chatReplay";
import { docStateAt } from "../../doc/docReplay";
import { TimelineDemoEngine } from "../../timeline/timelineReplay";
import type { TimelineClip } from "@nodetool-ai/timeline";
import { heroBriefCast } from "../heroBriefCast";
import { heroStoryboardCast } from "../heroStoryboardCast";
import { heroTimelineCast } from "../heroTimelineCast";
import { HERO_SHOTS } from "../shared";

/** The timeline cast's clips at `ms`, through the engine the player drives. */
const clipsAt = (ms: number): TimelineClip[] => {
  const engine = new TimelineDemoEngine(heroTimelineCast);
  try {
    engine.seekToTime(ms);
    return engine.instance.doc.getState().clips;
  } finally {
    engine.dispose();
  }
};

describe("hero casts — registered and well-formed", () => {
  it("are reachable from the demo page and the Remotion registries", () => {
    expect(chatCasts).toContain(heroBriefCast);
    expect(docCasts).toContain(heroStoryboardCast);
    expect(timelineCasts).toContain(heroTimelineCast);
  });

  it("agree on how long the teaser is", () => {
    // Three surfaces state the length: the brief in chat, each shot's target
    // on the board, and the ruler on the timeline. A viewer reads all three.
    const boardSeconds = HERO_SHOTS.reduce((n, s) => n + s.seconds, 0);
    const cutMs = clipsAt(heroTimelineCast.durationMs)
      .filter((c) => c.mediaType === "video")
      .reduce((ms, c) => ms + c.durationMs, 0);

    expect(cutMs).toBe(boardSeconds * 1000);
    expect(heroBriefCast.events.some((e) => JSON.stringify(e).includes(`${boardSeconds}-second`))).toBe(true);
  });

  it("pin every clip they reference to a file in the asset manifest", () => {
    const declared = (assets: { key: string; file?: string }[] | undefined) =>
      new Set((assets ?? []).map((a) => a.key));

    const boardKeys = declared(heroStoryboardCast.assets);
    const timelineKeys = declared(heroTimelineCast.assets);
    for (const shot of HERO_SHOTS) {
      expect(boardKeys.has(shot.clip)).toBe(true);
      expect(timelineKeys.has(shot.clip)).toBe(true);
    }
  });
});

describe("hero casts — one session across three surfaces", () => {
  it("chat: the brief goes in and the board comes back", () => {
    const start = computeChatStateAt(heroBriefCast.events, 600);
    expect(start.messages[0]?.role).toBe("user");
    expect(String(start.messages[0]?.content)).toContain("SCRAPHEART");

    const end = computeChatStateAt(
      heroBriefCast.events,
      heroBriefCast.durationMs
    );
    // It hands off to the board rather than rendering anything itself.
    const called = end.messages.flatMap((m) =>
      (m.tool_calls ?? []).map((c) => c.name)
    );
    expect(called).toEqual(["create_storyboard", "edit_storyboard"]);
    expect(end.runningToolCallId).toBeNull();
  });

  it("board: nothing is rendered at the start, six stills land, then six clips", () => {
    const shotsAt = (ms: number) => docStateAt(heroStoryboardCast, ms).shots;

    expect(shotsAt(0).every((s) => s.status === "planned")).toBe(true);
    expect(shotsAt(0)).toHaveLength(HERO_SHOTS.length);

    // Every still lands before the first clip render starts: the two-pass
    // order is the claim the stage makes.
    const stills = shotsAt(7600);
    expect(stills.every((s) => s.keyframe?.uri)).toBe(true);
    expect(stills.some((s) => s.clip)).toBe(false);

    const done = shotsAt(heroStoryboardCast.durationMs);
    expect(done.map((s) => s.status)).toEqual(
      HERO_SHOTS.map(() => "rendered")
    );
    expect(done.map((s) => s.clip?.uri)).toEqual(
      HERO_SHOTS.map((s) => `cast-asset://${s.clip}`)
    );
    // A still is never dropped when its clip arrives — re-rolling a shot
    // means re-animating the frame that is still there.
    expect(done.every((s) => s.keyframe?.uri)).toBe(true);
  });

  it("board: a card renders before it fills", () => {
    // Every shot passes through `clip_generating`, so the card shows work
    // rather than flipping from still to video between two frames.
    const seen = new Set<string>();
    for (let ms = 8000; ms <= heroStoryboardCast.durationMs; ms += 100) {
      for (const shot of docStateAt(heroStoryboardCast, ms).shots) {
        if (shot.status === "clip_generating") seen.add(shot.id);
      }
    }
    expect([...seen].sort()).toEqual(HERO_SHOTS.map((s) => s.id).sort());
  });

  it("timeline: the six clips land in cut order, back to back, under a score", () => {
    const end = clipsAt(heroTimelineCast.durationMs);
    const video = end
      .filter((c) => c.mediaType === "video")
      .sort((a, b) => a.startMs - b.startMs);

    expect(video.map((c) => c.currentAssetId)).toEqual(
      HERO_SHOTS.map((s) => s.clip)
    );
    expect(video.map((c) => c.storyboardShotId)).toEqual(
      HERO_SHOTS.map((s) => s.id)
    );
    // No gaps and no overlaps: a hole in the cut reads as a dropped shot.
    let at = 0;
    for (const clip of video) {
      expect(clip.startMs).toBe(at);
      at += clip.durationMs;
    }

    const score = end.filter((c) => c.mediaType === "audio");
    expect(score).toHaveLength(1);
    expect(score[0].durationMs).toBe(at);
  });

  it("timeline: every clip comes from the board the reel just filled", () => {
    const end = clipsAt(heroTimelineCast.durationMs);
    for (const clip of end.filter((c) => c.mediaType === "video")) {
      expect(clip.storyboardBoardId).toBe(heroStoryboardCast.docId);
    }
  });
});
