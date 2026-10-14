import { describe, expect, it } from "vitest";
import { exportInterchange } from "../src/interchange.js";
import { parseXml, premiereToTimeline, readPremiereXml } from "../src/interchangeImport.js";
import type { TimelineClip, TimelineTrack } from "../src/types.js";

const counters: Record<string, number> = {};
const newId = (kind: string): string => {
  counters[kind] = (counters[kind] ?? 0) + 1;
  return `${kind}-${counters[kind]}`;
};

function clip(overrides: Partial<TimelineClip>): TimelineClip {
  return {
    id: "c",
    trackId: "v1",
    name: "Clip",
    startMs: 0,
    durationMs: 1000,
    mediaType: "video",
    sourceType: "imported",
    status: "generated",
    locked: false,
    versions: [],
    ...overrides
  };
}

describe("parseXml", () => {
  it("reads elements, attributes, entities and CDATA and skips the prolog", () => {
    const root = parseXml('<?xml version="1.0"?>\n<!DOCTYPE xmeml>\n<!-- c --><a x="1 &amp; 2"><b>T &lt;&#65;&gt;</b><c/><d><![CDATA[<raw>]]></d></a>');
    const a = root.children[0]!;
    expect(a.attrs.x).toBe("1 & 2");
    expect(a.children.map((element) => element.name)).toEqual(["b", "c", "d"]);
    expect(a.children[0]!.text).toBe("T <A>");
    expect(a.children[2]!.text).toBe("<raw>");
  });

  it("does not expand DTD entities and rejects mismatched tags", () => {
    const root = parseXml('<!DOCTYPE x [<!ENTITY big "boom">]><x>&big;</x>');
    expect(root.children[0]!.text).toBe("&big;");
    expect(() => parseXml("<a><b></a>")).toThrow("unexpected </a>");
    expect(() => parseXml("<a>")).toThrow("never closed");
  });
});

describe("Premiere XML import", () => {
  const tracks: TimelineTrack[] = [
    { id: "title", name: "Title", type: "overlay", index: 0, visible: true, locked: false },
    { id: "v1", name: "Picture", type: "video", index: 1, visible: true, locked: true },
    { id: "a1", name: "Music", type: "audio", index: 2, visible: true, locked: false }
  ];
  const assets: Record<string, { hasAudio: boolean }> = {
    "logo.png": { hasAudio: false },
    "shot.mp4": { hasAudio: true },
    "music.wav": { hasAudio: false }
  };

  const exported = exportInterchange({
    name: "Round & trip", width: 1280, height: 720, fps: 29.97, tracks,
    clips: [
      clip({ id: "logo", trackId: "title", name: "Logo", mediaType: "image", currentAssetId: "logo.png", startMs: 500, durationMs: 2000, opacity: 0.5 }),
      clip({ id: "shot", trackId: "v1", name: "Shot", currentAssetId: "shot.mp4", startMs: 0, durationMs: 4000, inPointMs: 1000, speedMultiplier: 2, volumeDb: -6 }),
      clip({ id: "music", trackId: "a1", name: "Music", mediaType: "audio", currentAssetId: "music.wav", startMs: 1000, durationMs: 3000, muted: true })
    ],
    markers: [{ id: "m", timeMs: 2002, label: "Beat" }]
  }, {
    target: "premiere_xml",
    resolveAsset: (id) => ({ id, uri: `media/${id}`, durationMs: 20_000, hasAudio: assets[id]!.hasAudio })
  });

  it("reads back what the Premiere export writes", () => {
    const read = readPremiereXml(exported.xml);
    expect(read).toMatchObject({ name: "Round & trip", fps: 29.97, width: 1280, height: 720, warnings: [] });
    expect(read.files.map((file) => [file.name, file.still])).toEqual([
      ["shot.mp4", false],
      ["logo.png", true],
      ["music.wav", false]
    ]);

    const result = premiereToTimeline(read, { resolveFile: (file) => `asset:${file.name}`, newId });
    expect(result.warnings).toEqual([]);
    expect(result.tracks.map((track) => [track.name, track.type, track.index, track.locked])).toEqual([
      ["V2", "video", 0, false],
      ["V1", "video", 1, true],
      ["A2", "audio", 2, false]
    ]);
    const byName = new Map(result.clips.map((imported) => [imported.name, imported]));
    // The shot's own sound came back folded into the shot, not as a second clip.
    expect(result.clips).toHaveLength(3);
    expect(byName.get("Logo")).toMatchObject({ mediaType: "image", currentAssetId: "asset:logo.png", startMs: 501, opacity: 0.5 });
    expect(byName.get("Shot")).toMatchObject({ mediaType: "video", startMs: 0, durationMs: 4004, inPointMs: 1001, speedMultiplier: 2, volumeDb: -6 });
    expect(byName.get("Shot")!.muted).toBeUndefined();
    expect(byName.get("Music")).toMatchObject({ mediaType: "audio", muted: true, startMs: 1001 });
    expect(result.markers).toEqual([{ id: expect.any(String), timeMs: 2002, label: "Beat" }]);
  });

  it("leaves out clips whose media was not supplied and says which", () => {
    const result = premiereToTimeline(readPremiereXml(exported.xml), {
      resolveFile: (file) => (file.name === "music.wav" ? undefined : file.name)
    });
    expect(result.missingClips).toBe(1);
    expect(result.clips.map((imported) => imported.name).sort()).toEqual(["Logo", "Shot"]);
    expect(result.warnings).toEqual(["1 clip(s) were left out because their media was not supplied: music.wav."]);
  });

  it("resolves transition edges, links separate sound and silences unused sound", () => {
    const xml = `<?xml version="1.0"?><xmeml version="5"><project><children><sequence id="s">
      <name>Cut</name><rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
      <media><video><track>
        <clipitem id="a"><name>A</name><start>0</start><end>-1</end><in>0</in><out>60</out>
          <file id="f1"><name>a.mov</name><pathurl>file://localhost/Volumes/x/a%20b.mov</pathurl><duration>500</duration><media><video/><audio/></media></file></clipitem>
        <transitionitem><start>40</start><end>60</end></transitionitem>
        <clipitem id="b"><name>B</name><start>-1</start><end>100</end><in>0</in><out>60</out>
          <file id="f2"><pathurl>file://localhost/Volumes/x/b%20c.mov</pathurl><duration>500</duration><media><video/></media></file>
          <link><linkclipref>b</linkclipref></link><link><linkclipref>vo</linkclipref></link></clipitem>
        <generatoritem id="g"><name>Title</name></generatoritem>
      </track></video><audio><track>
        <clipitem id="vo"><name>VO</name><start>50</start><end>100</end><in>0</in><out>50</out>
          <file id="f3"><pathurl>vo.wav</pathurl><media><audio/></media></file>
          <link><linkclipref>b</linkclipref></link><link><linkclipref>vo</linkclipref></link></clipitem>
      </track></audio></media></sequence></children></project></xmeml>`;
    const read = readPremiereXml(xml);
    expect(read.files.map((file) => file.name)).toEqual(["a.mov", "b c.mov", "vo.wav"]);
    expect(read.warnings).toEqual([
      "1 transition(s) were imported as overlapping cuts.",
      "1 item(s) without media (nested sequences, generators, titles) were left out."
    ]);
    const result = premiereToTimeline(read, { resolveFile: (file) => file.id });
    const [a, b, vo] = result.clips;
    expect([a!.startMs, a!.durationMs, b!.startMs, b!.durationMs]).toEqual([0, 2400, 1600, 2400]);
    expect(a!.muted).toBe(true);
    expect(b!.linkId).toBeDefined();
    expect(vo!.linkId).toBe(b!.linkId);
  });

  it("rejects a document that is not xmeml", () => {
    expect(() => readPremiereXml("<fcpxml/>")).toThrow("Not a Final Cut Pro XML");
  });
});
