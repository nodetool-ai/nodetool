import { describe, expect, it } from "vitest";

import { scriptDocument } from "../src/api-schemas/scripts.js";
import { storyboardDocument } from "../src/api-schemas/storyboards.js";
import {
  timelineDocument,
  timelineSequenceResponse
} from "../src/api-schemas/timeline.js";

/** A board as it was stored before the lineage fields existed. */
const legacyBoard = {
  screenplay: null,
  shots: [],
  brief: "a kettle ad",
  style: "warm kitchen",
  entityIds: [],
  aspectRatio: "16:9",
  setupStage: "done",
  genre: "",
  directorModel: null,
  imageModel: null,
  videoModel: null
};

const legacySequence = {
  id: "tl_1",
  projectId: "default",
  name: "Cut",
  fps: 30,
  width: 1920,
  height: 1080,
  durationMs: 0,
  tracks: [],
  clips: [],
  markers: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

describe("storyboard document lineage", () => {
  it("parses a board written before the fields existed, without adding them", () => {
    const parsed = storyboardDocument.parse(legacyBoard);
    expect(parsed).toEqual(legacyBoard);
  });

  it("round-trips templateId and recastKey", () => {
    const parsed = storyboardDocument.parse({
      ...legacyBoard,
      templateId: "sb_template",
      recastKey: "ent_a>ent_b"
    });
    expect(parsed.templateId).toBe("sb_template");
    expect(parsed.recastKey).toBe("ent_a>ent_b");
  });
});

describe("script document lineage", () => {
  it("parses a script written before the field existed, without adding it", () => {
    const parsed = scriptDocument.parse({ cast: [], sections: [] });
    expect(parsed).toEqual({ cast: [], sections: [] });
  });

  it("round-trips templateId", () => {
    const parsed = scriptDocument.parse({
      cast: [],
      sections: [],
      templateId: "sc_template"
    });
    expect(parsed.templateId).toBe("sc_template");
  });
});

describe("timeline sequence lineage", () => {
  it("parses a document written before the field existed, without adding it", () => {
    const parsed = timelineDocument.parse({
      tracks: [],
      clips: [],
      markers: []
    });
    expect(parsed).toEqual({ tracks: [], clips: [], markers: [] });
  });

  it("round-trips templateId on the document and the response", () => {
    expect(
      timelineDocument.parse({
        tracks: [],
        clips: [],
        markers: [],
        templateId: "tl_template"
      }).templateId
    ).toBe("tl_template");
    expect(
      timelineSequenceResponse.parse({
        ...legacySequence,
        templateId: "tl_template"
      }).templateId
    ).toBe("tl_template");
  });
});
