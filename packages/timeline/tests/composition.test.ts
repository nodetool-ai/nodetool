/**
 * Compositions are copied into a document, so the checks here are about what
 * survives the copy: a round trip through instantiate/extract, and the two
 * authoring mistakes a template can make that are otherwise invisible — a
 * parameter addressing a field no child has, and a value of the wrong type.
 */
import { describe, expect, it } from "vitest";
import {
  extractComposition,
  instantiateComposition,
  validateCompositionParams,
  type TimelineComposition
} from "../src/composition.js";
import { makeClip } from "../src/defaults.js";
import type { TimelineClip } from "../src/types.js";

function lowerThird(): TimelineComposition {
  return {
    id: "comp-lower-third",
    name: "Lower third",
    params: {
      name: { type: "string", default: "Name", path: "/1/textStyle/text" },
      barColor: { type: "color", default: "#0A84FF", path: "/0/shapeStyle/fill" }
    },
    group: makeClip({
      id: "group-template",
      trackId: "overlay-1",
      name: "Lower third",
      mediaType: "group",
      startMs: 0,
      durationMs: 3000,
      sourceType: "imported",
      status: "generated"
    }),
    children: [
      makeClip({
        id: "bar",
        trackId: "overlay-1",
        name: "Bar",
        mediaType: "shape",
        startMs: 0,
        durationMs: 3000,
        status: "generated",
        shapeStyle: { kind: "rect", fill: "#0A84FF", x: 0.08, y: 0.74, width: 0.5, height: 0.12 }
      }),
      makeClip({
        id: "name",
        trackId: "overlay-1",
        name: "Name",
        mediaType: "text",
        startMs: 200,
        durationMs: 2800,
        status: "generated",
        textStyle: { text: "Name", fontSizePx: 64, color: "#FFFFFF" }
      })
    ]
  };
}

/** Ids the round-trip comparison ignores, replaced with their position. */
function withoutIds(clips: readonly TimelineClip[]): unknown {
  return clips.map((clip, index) => ({
    ...clip,
    id: `#${index}`,
    parentId: clip.parentId === undefined ? undefined : "#group"
  }));
}

describe("instantiateComposition + extractComposition", () => {
  it("round-trips a composition modulo ids", () => {
    const comp = lowerThird();
    let seq = 0;
    const clips = instantiateComposition(comp, {
      startMs: 5000,
      newId: () => `new-${++seq}`
    });

    const back = extractComposition({ clips }, clips[0].id, comp.params, {
      id: comp.id,
      name: comp.name
    });

    expect(back.id).toBe(comp.id);
    expect(back.name).toBe(comp.name);
    expect(back.params).toEqual(comp.params);
    expect(withoutIds([back.group])).toEqual(withoutIds([comp.group]));
    expect(withoutIds(back.children)).toEqual(withoutIds(comp.children));
  });

  it("stamps provenance and rebases child times onto the insertion point", () => {
    const comp = lowerThird();
    const clips = instantiateComposition(comp, {
      startMs: 5000,
      params: { name: "Ada Lovelace" }
    });

    expect(clips).toHaveLength(3);
    expect(clips[0].startMs).toBe(5000);
    // The text child sits 200ms into the group in the template.
    expect(clips[2].startMs).toBe(5200);
    expect(clips[2].parentId).toBe(clips[0].id);
    expect(clips[2].textStyle?.text).toBe("Ada Lovelace");
    // The unset parameter falls back to the template's own default.
    expect(clips[1].shapeStyle?.fill).toBe("#0A84FF");
    for (const clip of clips) {
      expect(clip.compositionId).toBe(comp.id);
      expect(clip.compositionParams).toEqual({
        name: "Ada Lovelace",
        barColor: "#0A84FF"
      });
    }
    // Fresh ids: nothing from the template leaks into the document.
    expect(clips.map((c) => c.id)).not.toContain("group-template");
  });

  it("refuses a parameter path that addresses no child field", () => {
    const comp = lowerThird();
    comp.params["role"] = {
      type: "string",
      default: "Engineer",
      path: "/4/textStyle/text"
    };

    expect(validateCompositionParams(comp)).toEqual([
      expect.stringContaining("/4/textStyle/text")
    ]);
    expect(() => instantiateComposition(comp, { startMs: 0 })).toThrow(
      /no child has/
    );
  });

  it("refuses a parameter value of the wrong type", () => {
    const comp = lowerThird();
    expect(() =>
      instantiateComposition(comp, {
        startMs: 0,
        params: { barColor: "cornflower" }
      })
    ).toThrow(/color/);
    expect(() =>
      instantiateComposition(comp, {
        startMs: 0,
        // SAFETY: the point of the case is a caller passing the wrong type.
        params: { name: 12 as unknown as string }
      })
    ).toThrow(/string/);
  });

  it("refuses a parameter the template does not declare", () => {
    expect(() =>
      instantiateComposition(lowerThird(), {
        startMs: 0,
        params: { subtitle: "nope" }
      })
    ).toThrow(/no parameter "subtitle"/);
  });

  it("refuses to extract a clip that is not a group", () => {
    const comp = lowerThird();
    const clips = instantiateComposition(comp, { startMs: 0 });
    expect(() => extractComposition({ clips }, clips[1].id)).toThrow(
      /not a group/
    );
    expect(() => extractComposition({ clips }, "nope")).toThrow(/no clip/i);
  });
});
