import { makeClip } from "@nodetool-ai/timeline";
import type { TimelineClip } from "@nodetool-ai/timeline";
import { childSpanMs } from "../GroupBracket";

/** Clips whose every full pass (a for-of, map or filter) is counted. */
function countingClips(clips: TimelineClip[]) {
  let passes = 0;
  const proxy = new Proxy(clips, {
    get(target, key) {
      if (key === Symbol.iterator || key === "map" || key === "filter") {
        passes++;
      }
      return target[key as keyof TimelineClip[]];
    }
  });
  return { clips: proxy, passes: () => passes };
}

describe("childSpanMs", () => {
  const build = () => {
    const clips: TimelineClip[] = [];
    for (let g = 0; g < 50; g++) {
      clips.push(
        makeClip({ id: `g${g}`, mediaType: "group", trackId: "v", startMs: g * 1000 }),
        makeClip({ id: `c${g}`, parentId: `g${g}`, trackId: "v2", startMs: g * 1000 + 100, durationMs: 500 })
      );
    }
    clips.push(makeClip({ id: "inner", mediaType: "group", parentId: "g0", trackId: "v", startMs: 0 }));
    clips.push(makeClip({ id: "deep", parentId: "inner", trackId: "v3", startMs: 50, durationMs: 2000 }));
    return clips;
  };

  it("reports the span of a group's descendants, nested ones included", () => {
    const clips = build();
    expect(childSpanMs(clips, "g0")).toEqual({ startMs: 0, endMs: 2050 });
    expect(childSpanMs(clips, "g3")).toEqual({ startMs: 3100, endMs: 3600 });
    expect(childSpanMs(clips, "c3")).toBeNull();
  });

  it("walks the clip array once per document, not once per bracket", () => {
    const { clips, passes } = countingClips(build());
    for (let g = 0; g < 50; g++) {
      childSpanMs(clips, `g${g}`);
      childSpanMs(clips, `g${g}`);
    }
    expect(passes()).toBe(1);
  });
});
