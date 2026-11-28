/**
 * The music document fields (MUSIC-MODE.md MD1 to MD5, PS-1, MM1 exit 1).
 *
 * The fixture holds every new field: `tempo.key`, `track.musicRole`,
 * `clipVersion.musicGeneration` with a splice and an alignment, and
 * `sequence.music.promptHistory`. The server parses a save through
 * `timelineDocument` and answers with `timelineSequenceResponse`, so both
 * must keep every field. The native save test (`tst_musicdocument`) sends
 * the same fixture and asserts the native model loses nothing on the way out.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  timelineDocument,
  timelineSequenceResponse,
  type TimelineSequenceResponse
} from "@nodetool-ai/protocol/api-schemas/timeline.js";
import type { TimelineSequence } from "../src/types.js";

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/music-document.json", import.meta.url), "utf8")
) as TimelineSequence;

/** The sequence columns a save sends beside the document (`documentForSave` in native/timeline/src/server/AutosaveController.cpp). */
const SEQUENCE_COLUMNS = ["id", "projectId", "workflowId", "name", "fps", "width", "height", "durationMs", "createdAt", "updatedAt"];

function documentPart(sequence: TimelineSequence): Record<string, unknown> {
  return Object.fromEntries(Object.entries(sequence).filter(([key]) => !SEQUENCE_COLUMNS.includes(key)));
}

/** Every object path in `raw` that `parsed` lacks: what a save would strip. */
function strippedPaths(raw: unknown, parsed: unknown, path = ""): string[] {
  if (Array.isArray(raw)) {
    return raw.flatMap((item, i) => strippedPaths(item, Array.isArray(parsed) ? parsed[i] : undefined, `${path}[${i}]`));
  }
  if (typeof raw !== "object" || raw === null) return [];
  const out = (typeof parsed === "object" && parsed !== null ? parsed : {}) as Record<string, unknown>;
  return Object.entries(raw).flatMap(([key, value]) => {
    const child = path ? `${path}.${key}` : key;
    return key in out ? strippedPaths(value, out[key], child) : [child];
  });
}

describe("music fields through the protocol schema", () => {
  it("holds every new field in the fixture", () => {
    expect(fixture.tempo?.key).toEqual({ tonic: "F#", mode: "minor" });
    expect(fixture.music?.promptHistory).toHaveLength(2);
    expect(fixture.tracks.map((t) => t.musicRole)).toEqual(["drums", "bass", "keyboard", "guitar"]);
    const records = fixture.clips[0]!.versions.map((v) => v.musicGeneration);
    expect(records.map((r) => r?.task)).toEqual(["text2music", "repaint"]);
    expect(records[1]?.splice?.crossfadeFrames).toBe(960);
    expect(records[0]?.alignment?.corrected).toBe(true);
  });

  it("saves through timelineDocument with nothing stripped", () => {
    const raw = documentPart(fixture);
    const parsed = timelineDocument.parse(raw);
    expect(strippedPaths(raw, parsed)).toEqual([]);
    expect(parsed).toEqual(raw);
    expect(parsed.tempo?.key).toEqual(fixture.tempo?.key);
    expect(parsed.music).toEqual(fixture.music);
    expect(parsed.tracks.map((t) => t.musicRole)).toEqual(fixture.tracks.map((t) => t.musicRole));
    expect(parsed.clips[0]!.versions.map((v) => v.musicGeneration)).toEqual(
      fixture.clips[0]!.versions.map((v) => v.musicGeneration)
    );
  });

  it("reads back through timelineSequenceResponse with the fields equal", () => {
    const parsed = timelineSequenceResponse.parse(fixture);
    expect(strippedPaths(fixture, parsed)).toEqual([]);
    expect(parsed).toEqual(fixture);
    // The document type and the protocol type are assignable both ways.
    const protocol: TimelineSequenceResponse = fixture;
    const back: TimelineSequence = protocol;
    expect(back.music?.promptHistory?.[0]).toBe("warm analog bass, slow groove");
  });

  it("finds a stripped field when the schema does not know it", () => {
    const raw = documentPart(fixture);
    const broken = { ...raw, tempo: { ...fixture.tempo, swing: 0.2 } };
    expect(strippedPaths(broken, timelineDocument.parse(broken))).toEqual(["tempo.swing"]);
  });

  it("opens a document without music fields unchanged (PS-2)", () => {
    const { music: _music, ...plain } = documentPart(fixture);
    const legacy = {
      ...plain,
      tempo: { bpm: 120, offsetMs: 0, timeSignature: { beatsPerBar: 4, beatUnit: 4 } },
      tracks: fixture.tracks.map(({ musicRole: _role, ...t }) => t),
      clips: fixture.clips.map((c) => ({ ...c, versions: c.versions.map(({ musicGeneration: _g, ...v }) => v) }))
    };
    const parsed = timelineDocument.parse(legacy);
    expect(parsed).toEqual(legacy);
    expect(parsed).not.toHaveProperty("music");
    expect(parsed.tempo).not.toHaveProperty("key");
  });
});
