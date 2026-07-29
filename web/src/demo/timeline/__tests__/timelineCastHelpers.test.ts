/**
 * @jest-environment node
 */
import {
  track,
  clip,
  addClip,
  patchClip,
  selectClips,
  zoom,
  seek,
  playRange,
} from "../timelineCastHelpers";
import type { TimelineCastEventPayload } from "../timelineCastTypes";

type PayloadOf<K extends TimelineCastEventPayload["kind"]> = Extract<
  TimelineCastEventPayload,
  { kind: K }
>;

describe("timelineCastHelpers", () => {
  describe("track", () => {
    it("creates a track with overrides applied", () => {
      const t = track({ name: "Voice" });
      expect(t.name).toBe("Voice");
      expect(t.id).toBeDefined();
    });

    it("creates a track with default values for missing fields", () => {
      const t = track({});
      expect(t.id).toBeDefined();
      expect(typeof t.id).toBe("string");
    });
  });

  describe("clip", () => {
    it("creates a clip with status defaulting to generated", () => {
      const c = clip({ trackId: "t1" });
      expect(c.status).toBe("generated");
      expect(c.trackId).toBe("t1");
    });

    it("overrides can set a different status", () => {
      const c = clip({ status: "draft" });
      expect(c.status).toBe("draft");
    });

    it("creates a clip with a unique id", () => {
      const c1 = clip({});
      const c2 = clip({});
      expect(c1.id).not.toBe(c2.id);
    });
  });

  describe("addClip", () => {
    it("creates an addClip event at the given time", () => {
      const c = clip({ trackId: "t1" });
      const evt = addClip(100, c);
      expect(evt.t).toBe(100);
      expect(evt.payload.kind).toBe("addClip");
      const p = evt.payload as PayloadOf<"addClip">;
      expect(p.clip).toBe(c);
    });
  });

  describe("patchClip", () => {
    it("creates a patchClip event with the given patch", () => {
      const evt = patchClip(200, "c1", { startMs: 5000 });
      expect(evt.t).toBe(200);
      expect(evt.payload.kind).toBe("patchClip");
      const p = evt.payload as PayloadOf<"patchClip">;
      expect(p.clipId).toBe("c1");
      expect(p.patch).toEqual({ startMs: 5000 });
    });
  });

  describe("selectClips", () => {
    it("creates a selection event with clip ids", () => {
      const evt = selectClips(300, ["c1", "c2"]);
      expect(evt.t).toBe(300);
      expect(evt.payload.kind).toBe("select");
      const p = evt.payload as PayloadOf<"select">;
      expect(p.clipIds).toEqual(["c1", "c2"]);
    });

    it("handles empty selection", () => {
      const evt = selectClips(300, []);
      const p = evt.payload as PayloadOf<"select">;
      expect(p.clipIds).toEqual([]);
    });
  });

  describe("zoom", () => {
    it("creates a zoom event", () => {
      const evt = zoom(400, 2.5);
      expect(evt.t).toBe(400);
      expect(evt.payload.kind).toBe("zoom");
      const p = evt.payload as PayloadOf<"zoom">;
      expect(p.msPerPx).toBe(2.5);
    });
  });

  describe("seek", () => {
    it("creates a seek event", () => {
      const evt = seek(500, 10000);
      expect(evt.t).toBe(500);
      expect(evt.payload.kind).toBe("seek");
      const p = evt.payload as PayloadOf<"seek">;
      expect(p.timeMs).toBe(10000);
    });
  });

  describe("playRange", () => {
    it("creates a playRange event with from/to/ramp", () => {
      const evt = playRange(600, 0, 5000, 2000);
      expect(evt.t).toBe(600);
      expect(evt.payload.kind).toBe("playRange");
      const p = evt.payload as PayloadOf<"playRange">;
      expect(p.fromMs).toBe(0);
      expect(p.toMs).toBe(5000);
      expect(p.rampMs).toBe(2000);
    });
  });
});
