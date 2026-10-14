import { describe, expect, it } from "vitest";
import { exportInterchange } from "../src/interchange.js";
import { parseXml, premiereToTimeline, readPremiereXml, type PremiereSequence } from "../src/interchangeImport.js";
import { makeClip, makeTrack } from "../src/defaults.js";

// Quadrupling the input costs about 4x for linear work and 16x for quadratic
// work. A ratio holds on a slow CI runner where a wall-clock bound does not.
const LINEAR_GROWTH_LIMIT = 10;

function bestTime(run: () => void): number {
  let best = Number.POSITIVE_INFINITY;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const started = performance.now();
    run();
    best = Math.min(best, performance.now() - started);
  }
  return best;
}

function growthRatio(run: (count: number) => void, count: number): number {
  return bestTime(() => run(count * 4)) / bestTime(() => run(count));
}

function sequence(): PremiereSequence {
  return {
    name: "cut", fps: 25, frameMs: 40, width: 1280, height: 720,
    videoTracks: [{ enabled: true, locked: false }], audioTracks: [{ enabled: true, locked: false }],
    files: [{ id: "camera", name: "camera.mp4", pathurl: "camera.mp4", hasVideo: true, hasAudio: true, still: false }],
    clips: [
      { id: "v", kind: "video", trackIndex: 0, name: "video", enabled: true, start: 0, end: 100, in: 25, fileId: "camera", links: ["a"] },
      { id: "a", kind: "audio", trackIndex: 0, name: "sound", enabled: true, start: 0, end: 100, in: 25, fileId: "camera", links: ["v"] }
    ], markers: [], warnings: []
  };
}

describe("Premiere import regressions", () => {
  it("rejects a long malformed attribute instead of retrying each suffix", () => {
    expect(() => parseXml(`<xmeml ${"a".repeat(32_000)}></xmeml>`)).toThrow(/attribute|token/);
  });

  it("bounds XML bytes, tag tokens, nodes and nesting before conversion", () => {
    expect(() => parseXml("x".repeat(8 * 1024 * 1024 + 1))).toThrow(/8 MiB/);
    expect(() => parseXml(`<x a="${"x".repeat(65_536)}"/>`)).toThrow(/token limit/);
    expect(() => parseXml("<x>".repeat(128) + "</x>".repeat(128))).toThrow(/depth limit/);
    expect(() => parseXml("<x/>".repeat(200_001))).toThrow(/node limit/);
    expect(() => parseXml('<x a="1" a="2"/>')).toThrow(/Duplicate XML attribute/);
  });

  it("bounds work for a large track with missing transition endpoints", () => {
    const xmlFor = (count: number): string => {
      const items = '<clipitem><start>-1</start><end>-1</end><file id="f"/></clipitem>'.repeat(count);
      return `<xmeml><sequence><media><video><track><file id="f"><name>shot.mp4</name><pathurl>shot.mp4</pathurl></file>${items}</track></video></media></sequence></xmeml>`;
    };
    const read = readPremiereXml(xmlFor(30_000));
    expect(read.clips).toEqual([]);
    expect(read.warnings).toContain("30000 item(s) without media (nested sequences, generators, titles) were left out.");
    expect(growthRatio((count) => readPremiereXml(xmlFor(count)), 7_500)).toBeLessThan(LINEAR_GROWTH_LIMIT);
  });

  it("collects a large distinct file table without scanning every clip per file", () => {
    const xmlFor = (count: number): string => {
      const files = Array.from({ length: count }, (_, index) => `<file id="f${index}"><pathurl>shot${index}.mp4</pathurl></file>`).join("");
      const clips = Array.from({ length: count }, (_, index) => `<clipitem><start>0</start><end>25</end><file id="f${index}"/></clipitem>`).join("");
      return `<xmeml><sequence><media><video>${files}<track>${clips}</track></video></media></sequence></xmeml>`;
    };
    const read = readPremiereXml(xmlFor(30_000));
    expect(read.files).toHaveLength(30_000);
    expect(read.clips).toHaveLength(30_000);
    expect(growthRatio((count) => readPremiereXml(xmlFor(count)), 7_500)).toBeLessThan(LINEAR_GROWTH_LIMIT);
  });

  it("indexes used tracks without repeatedly visiting every clip", () => {
    const tracks = Array.from({ length: 5000 }, (_, index) => `<track><clipitem id="c${index}"><start>0</start><end>25</end><file id="f"/></clipitem></track>`).join("");
    const xml = `<xmeml><sequence><media><video><file id="f"><name>shot.mp4</name><pathurl>shot.mp4</pathurl></file>${tracks}</video></media></sequence></xmeml>`;
    const read = readPremiereXml(xml);
    let trackReads = 0;
    for (const clip of read.clips) {
      const value = clip.trackIndex;
      Object.defineProperty(clip, "trackIndex", { get() { trackReads += 1; return value; } });
    }
    const imported = premiereToTimeline(read, { resolveFile: () => "asset" });
    expect(imported.clips).toHaveLength(5000);
    expect(imported.tracks).toHaveLength(5000);
    expect(trackReads).toBeLessThan(15_000);
  });

  it("imports a large linked group without repeated membership and clip scans", () => {
    const count = 25_000;
    const clips = Array.from({ length: count }, (_, index) => `<clipitem id="c${index}"><start>0</start><end>25</end><file id="f"/>${index === 0
      ? Array.from({ length: count }, (_, linked) => `<link><linkclipref>c${linked}</linkclipref></link>`).join("") : ""}</clipitem>`).join("");
    const xml = `<xmeml><sequence><media><video><file id="f"><name>shot.mp4</name><pathurl>shot.mp4</pathurl></file><track>${clips}</track></video></media></sequence></xmeml>`;
    const read = readPremiereXml(xml);
    const started = performance.now();
    const imported = premiereToTimeline(read, { resolveFile: () => "asset" });
    expect(imported.clips).toHaveLength(count);
    expect(new Set(imported.clips.map((clip) => clip.linkId)).size).toBe(1);
    expect(performance.now() - started).toBeLessThan(3000);
  });

  it("reads a greater-than sign inside a quoted attribute", () => {
    expect(parseXml('<x a="left > right"/>').children[0]!.attrs.a).toBe("left > right");
  });

  it.each([{ in: 75 }, { end: 50 }, { speed: 2 }])("retains independently edited linked audio %j", (change) => {
    const source = sequence();
    Object.assign(source.clips[1]!, change);
    const result = premiereToTimeline(source, { resolveFile: () => "asset" });
    expect(result.clips).toHaveLength(2);
    expect(result.clips.find((clip) => clip.mediaType === "audio")).toMatchObject({
      inPointMs: (change.in ?? 25) * 40, durationMs: (change.end ?? 100) * 40,
      ...(change.speed === undefined ? {} : { speedMultiplier: change.speed })
    });
  });

  it("preserves folded audio track mute without hiding the picture", () => {
    const source = sequence();
    source.audioTracks[0]!.enabled = false;
    const result = premiereToTimeline(source, { resolveFile: () => "asset" });
    expect(result.clips).toHaveLength(1);
    expect(result.clips[0]!.muted).toBe(true);
    expect(result.clips[0]!.hidden).toBeUndefined();
  });

  it("keeps embedded sound silent when replacement media is missing", () => {
    const source = sequence();
    source.files.push({ id: "dub", name: "dub.wav", pathurl: "dub.wav", hasVideo: false, hasAudio: true, still: false });
    source.clips[1]!.fileId = "dub";
    const result = premiereToTimeline(source, { resolveFile: (file) => file.id === "camera" ? "asset" : undefined });
    expect(result.missingClips).toBe(1);
    expect(result.clips[0]!.muted).toBe(true);
  });

  it("preserves stacking across a large overlap chain", () => {
    const track = makeTrack({ type: "video", index: 0 });
    const clips = Array.from({ length: 2000 }, (_, index) => makeClip({ id: `clip-${index}`, name: `clip-${index}`,
      trackId: track.id, mediaType: "video", currentAssetId: "media", startMs: index * 40, durationMs: 120_000,
      transitionIn: { type: "crossfade", durationMs: 0 } }));
    const exported = exportInterchange({ name: "large", width: 1280, height: 720, fps: 25, tracks: [track], clips, markers: [] }, {
      target: "premiere_xml", resolveAsset: (id) => ({ id, uri: "media.mp4", durationMs: 300_000, hasAudio: false })
    });
    const read = readPremiereXml(exported.xml);
    expect(read.clips).toHaveLength(2000);
    expect(read.clips.at(-1)).toMatchObject({ name: "clip-1999", trackIndex: 1999 });
  });

  it("preserves later clip stacking across an overlapping lane chain", () => {
    const track = makeTrack({ type: "video", index: 0 });
    const clips = [["A", 0, 2000], ["B", 1000, 3000], ["C", 2000, 3000]].map(([name, startMs, durationMs]) =>
      makeClip({ name: String(name), trackId: track.id, mediaType: "video", currentAssetId: String(name), startMs: Number(startMs), durationMs: Number(durationMs), transitionIn: { type: "crossfade", durationMs: 0 } }));
    const exported = exportInterchange({ name: "chain", width: 1280, height: 720, fps: 25, tracks: [track], clips, markers: [] }, {
      target: "premiere_xml", resolveAsset: (id) => ({ id, uri: `${id}.mp4`, durationMs: 10_000, hasAudio: false })
    });
    const imported = premiereToTimeline(readPremiereXml(exported.xml), { resolveFile: (file) => file.id });
    const visible = imported.clips.filter((clip) => clip.startMs <= 3000 && clip.startMs + clip.durationMs > 3000);
    visible.sort((a, b) => imported.tracks.find((track) => track.id === a.trackId)!.index - imported.tracks.find((track) => track.id === b.trackId)!.index);
    expect(visible[0]!.name).toBe("C");
  });
});
