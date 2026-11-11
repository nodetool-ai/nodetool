import { describe, expect, it } from "vitest";
import { exportInterchange, type InterchangeAsset } from "../src/interchange.js";
import { premiereToTimeline, readPremiereXml } from "../src/interchangeImport.js";
import { curveValueAtT, findKeyframeAnimation, setKeyframe } from "../src/keyframes.js";
import type { TimelineClip, TimelineTrack } from "../src/types.js";

const tracks: TimelineTrack[] = [
  { id: "v1", name: "Picture", type: "video", index: 0, visible: true, locked: false },
  { id: "a1", name: "Sound", type: "audio", index: 1, visible: true, locked: false }
];

function clip(overrides: Partial<TimelineClip> = {}): TimelineClip {
  return {
    id: "shot",
    trackId: "v1",
    name: "Shot",
    startMs: 0,
    durationMs: 2000,
    inPointMs: 0,
    mediaType: "video",
    sourceType: "imported",
    currentAssetId: "shot.mp4",
    status: "generated",
    locked: false,
    versions: [],
    ...overrides
  };
}

function keyed(base: TimelineClip, keys: Record<string, Array<[number, number, string?]>>): TimelineClip {
  let next = base;
  for (const [property, points] of Object.entries(keys)) {
    for (const [atMs, value, easing] of points) {
      next = { ...next, animations: setKeyframe(next, property as never, atMs, value) };
      if (easing) {
        const animation = findKeyframeAnimation(next)!;
        const curve = animation.custom!.curves.find((candidate) => candidate.property === property)!;
        curve.keyframes.find((key) => Math.abs(key.t - atMs / next.durationMs) < 1e-6)!.easing = easing;
      }
    }
  }
  return next;
}

function asset(overrides: Partial<InterchangeAsset> = {}) {
  return (id: string): InterchangeAsset => ({ id, uri: `media/${id}`, durationMs: 10_000, hasAudio: false, width: 1920, height: 1080, ...overrides });
}

function run(clips: TimelineClip[], options: { fps?: number; resolve?: (id: string) => InterchangeAsset; tracks?: TimelineTrack[] } = {}) {
  return exportInterchange(
    { name: "Cut", width: 1920, height: 1080, fps: options.fps ?? 30, tracks: options.tracks ?? tracks, clips },
    { target: "premiere_xml", resolveAsset: options.resolve ?? asset() }
  );
}

/** The `<parameter>` element with this id, from its first occurrence. */
function block(xml: string, id: string): string {
  const start = xml.indexOf(`<parameterid>${id}</parameterid>`);
  expect(start, `parameter ${id}`).toBeGreaterThan(-1);
  return xml.slice(start, xml.indexOf("</parameter>", start));
}

const messages = (result: ReturnType<typeof run>): string[] => result.report.warnings.map((warning) => warning.message);

describe("Basic Motion export", () => {
  it("writes scale, rotation, centre and anchor in Premiere units", () => {
    const { xml, report } = run([clip({ transform: { position: { x: 192, y: -108 }, scale: { x: 1.5, y: 1.5 }, rotation: Math.PI / 2, anchor: { x: 0.5, y: 0.5 } } })]);
    expect(report.warnings).toEqual([]);
    expect(xml).toContain("<name>Basic Motion</name><effectid>basic</effectid>");
    expect(block(xml, "scale")).toContain("<value>150</value>");
    expect(block(xml, "rotation")).toContain("<value>90</value>");
    expect(block(xml, "center")).toContain("<value><horiz>0.1</horiz><vert>-0.1</vert></value>");
    expect(block(xml, "centerOffset")).toContain("<value><horiz>0</horiz><vert>0</vert></value>");
  });

  it("moves Center by the anchor's offset, because Premiere puts the anchor at Center", () => {
    const { xml } = run([clip({ transform: { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, anchor: { x: 0, y: 0.5 } } })]);
    expect(block(xml, "center")).toContain("<horiz>-0.5</horiz><vert>0</vert>");
    expect(block(xml, "centerOffset")).toContain("<horiz>-0.5</horiz><vert>0</vert>");
  });

  it("scales a picture by the contain fit this editor applies, since Premiere shows it at its own size", () => {
    const portrait = run([clip()], { resolve: asset({ width: 1080, height: 1920 }) });
    expect(block(portrait.xml, "scale")).toContain("<value>56.25</value>");
    const large = run([clip({ transform: { position: { x: 0, y: 0 }, scale: { x: 2, y: 2 }, rotation: 0, anchor: { x: 0.5, y: 0.5 } } })], { resolve: asset({ width: 3840, height: 2160 }) });
    expect(block(large.xml, "scale")).toContain("<value>100</value>");
    expect(large.xml).toContain("<width>3840</width><height>2160</height>");
  });

  it("writes nothing for a picture that fills the frame untouched, and says when the size is unknown", () => {
    expect(run([clip()]).xml).not.toContain("<name>Basic Motion</name>");
    const unknown = run(
      [clip({ transform: { position: { x: 0, y: 0 }, scale: { x: 1.2, y: 1.2 }, rotation: 0, anchor: { x: 0.5, y: 0.5 } } })],
      { resolve: asset({ width: undefined, height: undefined }) }
    );
    expect(block(unknown.xml, "scale")).toContain("<value>120</value>");
    expect(messages(unknown)).toEqual(["Shot: the picture size is unknown, so Scale and Center assume it fills the frame."]);
  });

  it("writes the horizontal scale for both axes and says so", () => {
    const result = run([clip({ transform: { position: { x: 0, y: 0 }, scale: { x: 1.5, y: 1 }, rotation: 0, anchor: { x: 0.5, y: 0.5 } } })]);
    expect(block(result.xml, "scale")).toContain("<value>150</value>");
    expect(messages(result)).toEqual(["Shot: Premiere Basic Motion scales evenly, so the horizontal scale was written for both axes."]);
  });

  it("writes keyframes as source frames, offset by the in point and stretched by speed", () => {
    const base = clip({ inPointMs: 500, durationMs: 2000 });
    const withKeys = keyed(base, { scale: [[0, 1], [2000, 2]], rotation: [[0, 0], [2000, Math.PI]] });
    const { xml, report } = run([withKeys]);
    expect(report.warnings).toEqual([]);
    expect(block(xml, "scale")).toContain("<value>100</value><keyframe><when>15</when><value>100</value></keyframe><keyframe><when>75</when><value>200</value></keyframe>");
    expect(block(xml, "rotation")).toContain("<keyframe><when>15</when><value>0</value></keyframe><keyframe><when>75</when><value>180</value></keyframe>");

    const fast = run([keyed(clip({ durationMs: 2000, speedMultiplier: 2 }), { scale: [[0, 1], [2000, 2]] })]);
    expect(block(fast.xml, "scale")).toContain("<keyframe><when>0</when><value>100</value></keyframe><keyframe><when>120</when><value>200</value></keyframe>");
  });

  it("writes Center keyframes from offsets and keeps hold and curved segments", () => {
    const moving = keyed(clip(), { offsetX: [[0, 0], [1000, 192, "hold"], [2000, 384]] });
    const { xml } = run([moving]);
    const center = block(xml, "center");
    expect(center).toContain("<keyframe><when>0</when><value><horiz>0</horiz><vert>0</vert></value><interpolation><name>hold</name></interpolation></keyframe>");
    expect(center).toContain("<keyframe><when>30</when><value><horiz>0.1</horiz><vert>0</vert></value></keyframe>");
    expect(center).toContain("<keyframe><when>60</when><value><horiz>0.2</horiz><vert>0</vert></value></keyframe>");

    const eased = run([keyed(clip(), { rotation: [[0, 0], [2000, 1, "easeOut"]] })]);
    expect(block(eased.xml, "rotation")).toContain("<interpolation><name>FCPCurve</name></interpolation>");
    expect(messages(eased)).toEqual(["Shot: keyframe easing was written as smooth curves, without its handles."]);
  });

  it("replaces the position with positionX and positionY curves", () => {
    const { xml } = run([keyed(clip({ transform: { position: { x: 960, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, anchor: { x: 0.5, y: 0.5 } } }), { positionX: [[0, -960], [2000, 960]] })]);
    const center = block(xml, "center");
    expect(center).toContain("<when>0</when><value><horiz>-0.5</horiz>");
    expect(center).toContain("<when>60</when><value><horiz>0.5</horiz>");
  });
});

describe("Opacity export", () => {
  it("writes a static opacity and its keyframes multiplied together", () => {
    const { xml } = run([keyed(clip({ opacity: 0.5 }), { opacity: [[0, 0], [2000, 1]] })]);
    expect(block(xml, "opacity")).toContain("<value>0</value><keyframe><when>0</when><value>0</value></keyframe><keyframe><when>60</when><value>50</value></keyframe>");
  });

  it("keeps opacity keyframes alone when the clip has no static opacity", () => {
    const { xml } = run([keyed(clip(), { opacity: [[0, 1], [1000, 0.25], [2000, 1]] })]);
    expect(block(xml, "opacity")).toContain("<keyframe><when>30</when><value>25</value></keyframe>");
  });
});

describe("Time Remap export", () => {
  it("writes a reversed run as Speed with Reverse", () => {
    const result = run([clip({ timeRemap: { keyframes: [{ t: 0, sourceMs: 3000 }, { t: 1, sourceMs: 1000 }] } })]);
    expect(result.report.warnings).toEqual([]);
    expect(result.xml).toContain("<start>0</start><end>60</end><in>30</in><out>90</out>");
    expect(block(result.xml, "speed")).toContain("<value>100</value>");
    expect(block(result.xml, "reverse")).toContain("<value>TRUE</value>");
  });

  it("writes a constant-speed remap as Speed", () => {
    const result = run([clip({ timeRemap: { keyframes: [{ t: 0, sourceMs: 1000 }, { t: 1, sourceMs: 5000 }] } })]);
    expect(result.xml).toContain("<in>30</in><out>150</out>");
    expect(block(result.xml, "speed")).toContain("<value>200</value>");
    expect(block(result.xml, "reverse")).toContain("<value>FALSE</value>");
  });

  it("lists the keyframes of a reversed clip by source frame", () => {
    const remap = { keyframes: [{ t: 0, sourceMs: 3000 }, { t: 1, sourceMs: 1000 }] };
    const { xml, report } = run([keyed(clip({ timeRemap: remap }), { opacity: [[0, 0], [2000, 1]] })]);
    // The clip starts at source frame 90 and ends at 30: opacity 0 at 90 and 100 at 30, listed from 30.
    expect(block(xml, "opacity")).toContain("<keyframe><when>30</when><value>100</value></keyframe><keyframe><when>90</when><value>0</value></keyframe>");
    expect(report.warnings).toEqual([]);
    // A curved segment keeps its interpolation on the key that leaves toward the later frame.
    const eased = run([keyed(clip({ timeRemap: remap }), { opacity: [[0, 0], [1000, 0.5, "easeIn"], [2000, 1]] })]);
    expect(block(eased.xml, "opacity")).toContain("<keyframe><when>30</when><value>100</value></keyframe><keyframe><when>60</when><value>50</value><interpolation><name>FCPCurve</name></interpolation></keyframe><keyframe><when>90</when><value>0</value></keyframe>");
  });

  it("writes a hold on a reversed clip as straight segments and says so", () => {
    const remap = { keyframes: [{ t: 0, sourceMs: 3000 }, { t: 1, sourceMs: 1000 }] };
    const result = run([keyed(clip({ timeRemap: remap }), { opacity: [[0, 0], [2000, 1, "hold"]] })]);
    expect(block(result.xml, "opacity")).not.toContain("hold");
    expect(messages(result)).toEqual(["Shot: hold keyframes on a reversed clip were written as straight segments."]);
  });

  it("still reports ramps and freezes, which Premiere rebuilds by hand", () => {
    const ramp = run([clip({ timeRemap: { keyframes: [{ t: 0, sourceMs: 0 }, { t: 0.5, sourceMs: 500 }, { t: 1, sourceMs: 4000 }] } })]);
    const freeze = run([clip({ timeRemap: { keyframes: [{ t: 0, sourceMs: 700 }] } })]);
    const eased = run([clip({ timeRemap: { keyframes: [{ t: 0, sourceMs: 0 }, { t: 1, sourceMs: 4000, easing: "easeIn" }] } })]);
    for (const result of [ramp, freeze, eased]) expect(messages(result)).toEqual(["Shot: time remap requires baking."]);
  });
});

describe("pproTicks", () => {
  it("writes the source in and out as Premiere ticks", () => {
    const { xml } = run([clip({ inPointMs: 500, durationMs: 2000, speedMultiplier: 2 })]);
    expect(xml).toContain("<pproTicksIn>127008000000</pproTicksIn><pproTicksOut>1143072000000</pproTicksOut>");
  });

  it("writes none for a still", () => {
    expect(run([clip({ mediaType: "image", currentAssetId: "still.png" })]).xml).not.toContain("pproTicks");
  });
});

describe("Audio Levels and Pan export", () => {
  const sound = (overrides: Partial<TimelineClip> = {}) =>
    clip({ id: "music", trackId: "a1", name: "Music", mediaType: "audio", currentAssetId: "music.wav", ...overrides });

  it("writes fades as level keyframes", () => {
    const { xml, report } = run([sound({ fadeInMs: 500, fadeOutMs: 500 })]);
    expect(report.warnings).toEqual([]);
    expect(block(xml, "level")).toContain(
      "<keyframe><when>0</when><value>0</value></keyframe><keyframe><when>15</when><value>1</value></keyframe>" +
      "<keyframe><when>45</when><value>1</value></keyframe><keyframe><when>60</when><value>0</value></keyframe>"
    );
  });

  it("scales fades by the clip volume and follows a curved shape", () => {
    const { xml } = run([sound({ volumeDb: -6, fadeInMs: 400, fadeInShape: "sCurve" })]);
    const level = block(xml, "level");
    expect(level).toContain("<keyframe><when>0</when><value>0</value></keyframe>");
    // The s-curve passes half gain at the midpoint of the fade.
    expect(level).toContain("<keyframe><when>6</when><value>0.250594</value></keyframe>");
    expect(level).toContain("<keyframe><when>12</when><value>0.501187</value></keyframe>");
    expect(level.match(/<keyframe>/g)).toHaveLength(6);
  });

  it("folds the track fader into the level and writes the track pan", () => {
    const quiet: TimelineTrack[] = [tracks[0]!, { ...tracks[1]!, volumeDb: -6, pan: 0.5 }];
    const { xml } = run([sound({ volumeDb: -6 })], { tracks: quiet });
    expect(block(xml, "level")).toContain("<value>0.251189</value>");
    expect(xml).toContain("<name>Audio Pan</name><effectid>audiopan</effectid>");
    expect(block(xml, "pan")).toContain("<valuemin>-1</valuemin><valuemax>1</valuemax><value>0.5</value>");
  });

  it("limits a volume above +12 dB and says so", () => {
    const result = run([sound({ volumeDb: 20 })]);
    expect(block(result.xml, "level")).toContain("<value>3.98109</value>");
    expect(messages(result)).toEqual(["Music: volume above +12 dB was limited to +12 dB, the most Premiere's Audio Levels holds."]);
  });

  it("puts a video's own fade on its sound", () => {
    const { xml } = run([clip({ fadeOutMs: 1000 })], { resolve: asset({ hasAudio: true }) });
    const sound = xml.slice(xml.indexOf("<audio><numOutputChannels>"));
    expect(block(sound, "level")).toContain("<keyframe><when>0</when><value>1</value></keyframe><keyframe><when>30</when><value>1</value></keyframe><keyframe><when>60</when><value>0</value></keyframe>");
  });
});

describe("Rates and frames", () => {
  it("writes the NTSC family as a whole timebase with ntsc set, drop-frame only at 29.97 and 59.94", () => {
    const expectations: Array<[number, number, string]> = [
      [23.976, 24, "NDF"], [29.97, 30, "DF"], [47.952, 48, "NDF"], [59.94, 60, "DF"], [119.88, 120, "NDF"]
    ];
    for (const [fps, timebase, display] of expectations) {
      const { xml, report } = run([clip()], { fps });
      expect(xml, String(fps)).toContain(`<rate><timebase>${timebase}</timebase><ntsc>TRUE</ntsc></rate>`);
      expect(xml, String(fps)).toContain(`<displayformat>${display}</displayformat>`);
      expect(report.warnings).toEqual([]);
    }
    const exact = run([clip()], { fps: 24 });
    expect(exact.xml).toContain("<timebase>24</timebase><ntsc>FALSE</ntsc>");
  });

  it("counts frames on the 1001 lattice without drift", () => {
    const { xml } = run([clip({ startMs: 3_600_000, durationMs: 10_000, inPointMs: 0 })], { fps: 23.976 });
    // 3600 s at 24000/1001 fps is 86313.6 frames, and 10 s is 239.76.
    expect(xml).toContain("<start>86314</start><end>86553</end>");
  });

  it("keeps out minus in equal to end minus start at normal speed", () => {
    const { xml } = run([clip({ startMs: 20, durationMs: 60, inPointMs: 0 })], { fps: 25 });
    expect(xml).toContain("<start>1</start><end>2</end><in>0</in><out>1</out>");
  });

  it("says when a rate is not a Premiere timebase", () => {
    const result = run([clip()], { fps: 12.5 });
    expect(messages(result)).toEqual(["12.5 fps is not a Premiere timebase, so the sequence was written at 13 fps and clip times shift."]);
  });
});

describe("what still needs baking", () => {
  it("reports presets, keyframes on other properties and 3D transforms", () => {
    const preset = run([clip({ animations: [{ id: "a", role: "in", preset: "pop", durationMs: 500 }] })]);
    expect(messages(preset)).toEqual(["Shot: animations require baking."]);
    const blurred = run([keyed(clip(), { blur: [[0, 0], [2000, 8]] })]);
    expect(messages(blurred)).toEqual(["Shot: keyframes on blur require baking."]);
    const tilted = run([clip({ transform: { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, rotationX: 20, anchor: { x: 0.5, y: 0.5 } } })]);
    expect(messages(tilted)).toEqual(["Shot: 3D transforms require baking."]);
  });

  it("does not report keyframes, a plain transform or fades, which are written", () => {
    const result = run([keyed(clip({ transform: { position: { x: 10, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, anchor: { x: 0.5, y: 0.5 } }, fadeInMs: 200 }), { opacity: [[0, 0], [2000, 1]] })]);
    expect(result.report.warnings).toEqual([]);
  });

  it("reports fades and transforms for FCPXML, which does not carry them", () => {
    const result = exportInterchange(
      { name: "Cut", width: 1920, height: 1080, fps: 30, tracks, clips: [clip({ fadeInMs: 200, transform: { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, anchor: { x: 0.5, y: 0.5 } } })] },
      { target: "fcpxml", resolveAsset: asset() }
    );
    expect(messages(result)).toEqual(["Shot: advanced transforms require baking.", "Shot: audio fades require baking."]);
  });
});

describe("markers", () => {
  it("writes a note as the comment and a range as in and out", () => {
    const { xml } = exportInterchange(
      { name: "Cut", width: 1920, height: 1080, fps: 30, tracks, clips: [clip()], markers: [{ id: "m", timeMs: 1000, label: "Review", note: "fix & check", durationMs: 500 }] },
      { target: "premiere_xml", resolveAsset: asset() }
    );
    expect(xml).toContain("<marker><comment>fix &amp; check</comment><name>Review</name><in>30</in><out>45</out></marker>");
  });
});

/** Export, then read the XML back the way the server import does. */
function roundTrip(clips: TimelineClip[], options: { fps?: number; resolve?: (id: string) => InterchangeAsset; markers?: Parameters<typeof exportInterchange>[0]["markers"] } = {}) {
  const exported = exportInterchange(
    { name: "Cut", width: 1920, height: 1080, fps: options.fps ?? 30, tracks, clips, ...(options.markers ? { markers: options.markers } : {}) },
    { target: "premiere_xml", resolveAsset: options.resolve ?? asset() }
  );
  const imported = premiereToTimeline(readPremiereXml(exported.xml), { resolveFile: (file) => `asset:${file.name}` });
  return { exported, imported };
}

function curveFor(imported: TimelineClip, property: string) {
  return findKeyframeAnimation(imported)?.custom?.curves.find((curve) => curve.property === property)?.keyframes;
}

describe("round trip", () => {
  it("returns the transform", () => {
    const original = { position: { x: 192, y: -108 }, scale: { x: 1.5, y: 1.5 }, rotation: 0.5, anchor: { x: 0.25, y: 0.6 } };
    const { imported } = roundTrip([clip({ transform: original })]);
    const back = imported.clips[0]!.transform!;
    expect(back.position.x).toBeCloseTo(192, 4);
    expect(back.position.y).toBeCloseTo(-108, 4);
    expect(back.scale.x).toBeCloseTo(1.5, 5);
    expect(back.rotation).toBeCloseTo(0.5, 5);
    expect(back.anchor.x).toBeCloseTo(0.25, 5);
    expect(back.anchor.y).toBeCloseTo(0.6, 5);
    expect(imported.warnings).toEqual([]);
  });

  it("returns the contain fit as no transform at all", () => {
    const { imported } = roundTrip([clip()], { resolve: asset({ width: 3840, height: 2160 }) });
    expect(imported.clips[0]!.transform).toBeUndefined();
    const portrait = roundTrip([clip()], { resolve: asset({ width: 1080, height: 1920 }) });
    expect(portrait.imported.clips[0]!.transform).toBeUndefined();
  });

  it("returns keyframes, with easing", () => {
    const original = keyed(clip({ inPointMs: 500, speedMultiplier: 2 }), {
      opacity: [[0, 0], [1000, 1, "hold"], [2000, 0.4]],
      scale: [[0, 1], [2000, 2]],
      offsetX: [[0, -100], [2000, 100]],
      rotation: [[0, 0], [2000, 1]]
    });
    const { imported, exported } = roundTrip([original]);
    expect(exported.report.warnings).toEqual([]);
    const back = imported.clips[0]!;
    expect(imported.warnings).toEqual([]);
    const sampled = (property: string, clipWithKeys: TimelineClip, t: number) =>
      curveValueAtT(findKeyframeAnimation(clipWithKeys)!.custom!.curves.find((curve) => curve.property === property)!.keyframes, t);
    for (const property of ["opacity", "scale", "offsetX", "rotation"]) {
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        expect(sampled(property, back, t), `${property} at ${t}`).toBeCloseTo(sampled(property, original, t), 4);
      }
    }
    // Hold leaves the 0 key and arrives at 1 on the key after it.
    expect(curveFor(back, "opacity")![1]!.easing).toBe("hold");
    expect(back.durationMs).toBe(2000);
  });

  it("returns fades, their shape and the volume", () => {
    const original = clip({ id: "music", trackId: "a1", name: "Music", mediaType: "audio", currentAssetId: "music.wav", volumeDb: -6, fadeInMs: 500, fadeInShape: "sCurve", fadeOutMs: 300 });
    const { imported } = roundTrip([original]);
    expect(imported.clips[0]).toMatchObject({ volumeDb: -6, fadeInMs: 500, fadeInShape: "sCurve", fadeOutMs: 300 });
    expect(imported.clips[0]!.fadeOutShape).toBeUndefined();
    expect(imported.warnings).toEqual([]);
  });

  it("returns a reversed run and a constant speed", () => {
    const reversed = roundTrip([clip({ timeRemap: { keyframes: [{ t: 0, sourceMs: 3000 }, { t: 1, sourceMs: 1000 }] } })]).imported;
    expect(reversed.clips[0]!.timeRemap).toEqual({ keyframes: [{ t: 0, sourceMs: 3000 }, { t: 1, sourceMs: 1000 }] });
    expect(reversed.warnings).toEqual([]);
    const fast = roundTrip([clip({ speedMultiplier: 2, inPointMs: 500 })]).imported;
    expect(fast.clips[0]).toMatchObject({ speedMultiplier: 2, inPointMs: 500 });
  });

  it("returns the keyframes of a reversed clip", () => {
    const original = keyed(clip({ timeRemap: { keyframes: [{ t: 0, sourceMs: 3000 }, { t: 1, sourceMs: 1000 }] } }), {
      opacity: [[0, 0], [1000, 0.5], [2000, 1]]
    });
    const { imported } = roundTrip([original]);
    const back = imported.clips[0]!;
    expect(back.timeRemap).toEqual(original.timeRemap);
    for (const t of [0, 0.25, 0.49, 0.5, 0.75, 1]) {
      const sample = (target: TimelineClip) => curveValueAtT(findKeyframeAnimation(target)!.custom!.curves[0]!.keyframes, t);
      expect(sample(back), `at ${t}`).toBeCloseTo(sample(original), 4);
    }
  });

  it("returns the source in point exactly through the ticks", () => {
    const { imported } = roundTrip([clip({ inPointMs: 1234 })], { fps: 29.97 });
    expect(imported.clips[0]!.inPointMs).toBe(1234);
  });

  it("returns marker notes and ranges", () => {
    const { imported } = roundTrip([clip()], { markers: [{ id: "m", timeMs: 1000, label: "Review", note: "check", durationMs: 500 }] });
    expect(imported.markers).toEqual([expect.objectContaining({ timeMs: 1000, label: "Review", note: "check", durationMs: 500 })]);
  });

  it("returns the NTSC rate", () => {
    const { imported } = roundTrip([clip()], { fps: 23.976 });
    expect(imported.fps).toBe(23.976);
  });
});

describe("Premiere files", () => {
  const xml = (clipitem: string, size = "<width>3840</width><height>2160</height>") =>
    `<xmeml version="4"><sequence><name>S</name><rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate><media><video><format><samplecharacteristics><width>1920</width><height>1080</height></samplecharacteristics></format>` +
    `<track><clipitem id="c1"><name>A</name><enabled>TRUE</enabled><start>0</start><end>50</end><in>0</in><out>50</out>` +
    `<file id="f1"><name>a.mp4</name><pathurl>a.mp4</pathurl><duration>500</duration><media><video><samplecharacteristics>${size}</samplecharacteristics></video></media></file>${clipitem}</clipitem></track></video></media></sequence></xmeml>`;
  const motion = (filters: string) => premiereToTimeline(readPremiereXml(xml(filters)), { resolveFile: () => "asset" });

  it("shows a picture at its own size when no Basic Motion says otherwise", () => {
    const result = motion("");
    expect(result.clips[0]!.transform!.scale.x).toBeCloseTo(2, 5);
  });

  it("ignores a disabled filter", () => {
    const disabled = `<filter><enabled>FALSE</enabled><effect><name>Opacity</name><effectid>opacity</effectid><parameter><parameterid>opacity</parameterid><value>20</value></parameter></effect></filter>`;
    expect(motion(disabled).clips[0]!.opacity).toBeUndefined();
  });

  it("cuts keyframes that lie outside the clip at its edges", () => {
    const keys = `<filter><effect><name>Opacity</name><effectid>opacity</effectid><parameter><parameterid>opacity</parameterid><value>0</value>` +
      `<keyframe><when>-25</when><value>0</value></keyframe><keyframe><when>75</when><value>100</value></keyframe></parameter></effect></filter>`;
    const curve = findKeyframeAnimation(motion(keys).clips[0]!)!.custom!.curves[0]!;
    expect(curve.keyframes.map((key) => [key.t, key.value])).toEqual([[0, 0.25], [1, 0.75]]);
  });

  it("reads a negative speed as reverse and warns about a freeze frame", () => {
    const speed = (value: number) => `<filter><effect><name>Time Remap</name><effectid>timeremap</effectid><parameter><parameterid>speed</parameterid><value>${value}</value></parameter></effect></filter>`;
    expect(motion(speed(-200)).clips[0]!.timeRemap).toEqual({ keyframes: [{ t: 0, sourceMs: 2000 }, { t: 1, sourceMs: 0 }] });
    expect(motion(speed(0)).warnings).toEqual(["A: a freeze frame was imported as playing."]);
  });
});
