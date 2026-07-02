/**
 * Promo casts (the landing-page product video, demo/src/promo) — guard the
 * invariants the video render depends on:
 *   1. events arrive sorted by `t` (the replay scan stops at the first event
 *      beyond the seek time, so an unsorted cast silently drops state);
 *   2. mid-run, completed takes surface as live generations with resolved
 *      `cast-asset://` URIs while later takes are still in flight;
 *   3. the timeline cast's generated clip walks queued → generating →
 *      generated and every clip's asset key exists in the manifest.
 */
import { DemoEngine } from "../demoEngine";
import { promoTrailerCast } from "../promoTrailerCast";
import { promoTimelineCast, PROMO_TIMELINE_MARKS } from "../timeline/promoTimelineCast";
import { TimelineDemoEngine } from "../timeline/timelineReplay";
import useResultsStore from "../../stores/ResultsStore";

const resolveAssetUrl = (f: string) => `/casts/promo/${f}`;

describe("promoTrailerCast", () => {
  it("has events sorted ascending by t", () => {
    const ts = promoTrailerCast.events.map((e) => e.t);
    expect(ts).toEqual([...ts].sort((a, b) => a - b));
  });

  it("shows completed takes while others still render (the mid-run frame)", () => {
    const engine = new DemoEngine(promoTrailerCast, { resolveAssetUrl });
    engine.seekToTime(6800);

    const outputsOf = (nodeId: string) =>
      useResultsStore
        .getState()
        .getLiveGenerations(promoTrailerCast.workflow.id, nodeId)
        .at(-1);

    // seedanceFast (5400) and wan25 (6300) are done…
    const wheel = outputsOf("seedanceFast");
    expect(wheel?.status).toBe("completed");
    expect(wheel?.outputs).toMatchObject({
      output: { type: "video", uri: "/casts/promo/take-wheel.webm" },
    });
    expect(outputsOf("wan25")?.status).toBe("completed");

    // …while seedance (7100) and wan26 (7900) are still generating.
    expect(outputsOf("seedance")?.status).toBe("running");
    expect(outputsOf("wan26")?.status).toBe("running");

    engine.dispose();
  });

  it("lands all four takes by the end", () => {
    const engine = new DemoEngine(promoTrailerCast, { resolveAssetUrl });
    engine.seekToTime(promoTrailerCast.durationMs);
    for (const nodeId of ["seedance", "seedanceFast", "wan26", "wan25"]) {
      const last = useResultsStore
        .getState()
        .getLiveGenerations(promoTrailerCast.workflow.id, nodeId)
        .at(-1);
      expect(last?.status).toBe("completed");
    }
    engine.dispose();
  });
});

describe("promoTimelineCast", () => {
  it("has events sorted ascending by t", () => {
    const ts = promoTimelineCast.events.map((e) => e.t);
    expect(ts).toEqual([...ts].sort((a, b) => a - b));
  });

  it("references only assets present in the manifest", () => {
    const keys = new Set(promoTimelineCast.assets.map((a) => a.key));
    const clipAssetIds = promoTimelineCast.events
      .flatMap((e) =>
        e.payload.kind === "addClip"
          ? [e.payload.clip.currentAssetId]
          : e.payload.kind === "patchClip"
            ? [e.payload.patch.currentAssetId]
            : []
      )
      .filter((id): id is string => typeof id === "string");
    expect(clipAssetIds.length).toBeGreaterThan(0);
    for (const id of clipAssetIds) {
      expect(keys.has(id)).toBe(true);
    }
  });

  it("walks the generated clip through queued → generating → generated", () => {
    const engine = new TimelineDemoEngine(promoTimelineCast, { resolveAssetUrl });
    const clipStatus = () =>
      engine.instance.doc
        .getState()
        .clips.find((c) => c.id === "promo-clip-chained")?.status;

    engine.seekToTime(PROMO_TIMELINE_MARKS.clipQueued + 100);
    expect(clipStatus()).toBe("queued");

    engine.seekToTime(13600);
    expect(clipStatus()).toBe("generating");

    engine.seekToTime(PROMO_TIMELINE_MARKS.clipReady + 100);
    expect(clipStatus()).toBe("generated");

    // The full cut: five video clips + the score on the audio track.
    engine.seekToTime(promoTimelineCast.durationMs);
    const clips = engine.instance.doc.getState().clips;
    expect(clips).toHaveLength(6);
    expect(clips.filter((c) => c.mediaType === "video")).toHaveLength(5);

    engine.dispose();
  });
});
