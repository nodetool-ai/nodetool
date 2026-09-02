/**
 * `font_not_portable` (T17, D8), plus the one cross-package invariant the
 * font pipeline rests on.
 *
 * `packages/config` and `packages/timeline` each hold a list of the shipped
 * font files, and neither may import the other — the registry module takes no
 * imports at all, because the build scripts load it straight from `dist/`.
 * This package depends on both, so this is where the two lists are held
 * together. Nothing else notices when they drift: the bundler would stage a
 * file the catalog never registers, or the catalog would ask for a face no
 * artifact ships.
 */
import { describe, expect, it } from "vitest";
import { PACKAGE_RUNTIME_ASSET_DIRS } from "@nodetool-ai/config";
import { BUNDLED_FONT_FILES } from "@nodetool-ai/timeline";

import { validateTimelineSequence } from "../src/timeline-debug/index.js";

type Json = Record<string, unknown>;

const clip = (over: Json): Json => ({
  trackId: "track-1",
  name: "Title",
  startMs: 0,
  durationMs: 1000,
  mediaType: "text",
  sourceType: "imported",
  status: "generated",
  locked: false,
  versions: [],
  ...over
});

const doc = (clips: Json[]): Json => ({
  tracks: [
    {
      id: "track-1",
      name: "Overlay 1",
      type: "overlay",
      index: 0,
      visible: true,
      locked: false
    }
  ],
  clips,
  markers: []
});

const textStyle = (fontFamily?: string): Json => ({
  text: "SCRAPHEART",
  fontSizePx: 96,
  color: "#ffffff",
  ...(fontFamily === undefined ? {} : { fontFamily })
});

const fontWarnings = (
  result: ReturnType<typeof validateTimelineSequence>
): ReadonlyArray<{ message: string; path?: string }> =>
  result.warnings.filter((w) => w.code === "font_not_portable");

describe("bundled font registration", () => {
  it("registers the fonts directory so the bundle stages and verifies it", () => {
    const entry = PACKAGE_RUNTIME_ASSET_DIRS.find(
      (dir) => dir.pkg === "@nodetool-ai/timeline" && dir.path === "fonts"
    );
    expect(entry).toBeDefined();
    expect(entry?.bundleDir).toBe("fonts");
  });

  it("registers exactly the files the catalog declares", () => {
    const entry = PACKAGE_RUNTIME_ASSET_DIRS.find(
      (dir) => dir.pkg === "@nodetool-ai/timeline" && dir.path === "fonts"
    );
    expect([...(entry?.files ?? [])].sort()).toEqual(
      [...BUNDLED_FONT_FILES].sort()
    );
  });
});

describe("validateTimelineSequence — font portability", () => {
  it("stays quiet on a bundled family", () => {
    const result = validateTimelineSequence(
      doc([clip({ id: "a", textStyle: textStyle("Bebas Neue") })])
    );
    expect(fontWarnings(result)).toEqual([]);
  });

  it("stays quiet on a clip that names no family at all", () => {
    const result = validateTimelineSequence(
      doc([clip({ id: "a", textStyle: textStyle() })])
    );
    expect(fontWarnings(result)).toEqual([]);
  });

  // The fixture that fails the check (I12).
  it("flags a system-only family and names it", () => {
    const result = validateTimelineSequence(
      doc([clip({ id: "a", textStyle: textStyle("Helvetica Neue") })])
    );
    const warnings = fontWarnings(result);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toContain("Helvetica Neue");
    expect(warnings[0]?.message).toContain("Bebas Neue");
    expect(warnings[0]?.path).toBe("textStyle.fontFamily");
    // A warning, so the document still validates.
    expect(result.ok).toBe(true);
  });

  it("flags a caption style's family too", () => {
    const result = validateTimelineSequence(
      doc([
        clip({
          id: "a",
          mediaType: "video",
          caption: {
            words: [{ word: "hi", startMs: 0, endMs: 400 }],
            style: { fontFamily: "Comic Sans MS" }
          }
        })
      ])
    );
    const warnings = fontWarnings(result);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.path).toBe("caption.style.fontFamily");
  });

  it("flags a text clip and its caption separately", () => {
    const result = validateTimelineSequence(
      doc([
        clip({
          id: "a",
          textStyle: textStyle("Futura"),
          caption: {
            words: [{ word: "hi", startMs: 0, endMs: 400 }],
            style: { fontFamily: "Futura" }
          }
        })
      ])
    );
    expect(fontWarnings(result)).toHaveLength(2);
  });
});
