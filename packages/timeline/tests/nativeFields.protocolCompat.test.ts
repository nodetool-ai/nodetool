/**
 * `types.ts` spells the document types out, so nothing but this file stops the
 * marker and clip fields the native editor writes from drifting away from the
 * protocol schema. Each type is assigned to the other in both directions, so a
 * field added to one and not the other fails to compile here. The parses fail
 * at run time if the schema strips a field on save.
 */

import { describe, expect, it } from "vitest";
import {
  clipAudioRole,
  timelineMarker,
  type ClipAudioRole as ProtocolClipAudioRole,
  type TimelineMarker as ProtocolTimelineMarker
} from "@nodetool-ai/protocol/api-schemas/timeline.js";
import type { ClipAudioRole, TimelineMarker } from "../src/types.js";

describe("native editor fields match the protocol", () => {
  it("keeps every marker field through the schema", () => {
    const marker: TimelineMarker = {
      id: "m1",
      timeMs: 1000,
      label: "Beat",
      color: "#ff0000",
      note: "Hold here",
      durationMs: 2500,
      author: "Ana"
    };
    const protocol: ProtocolTimelineMarker = marker;
    const back: TimelineMarker = protocol;
    expect(timelineMarker.parse(back)).toEqual(marker);
  });

  it("lists the same audio roles", () => {
    const roles: ClipAudioRole[] = ["dialogue", "music", "sfx", "ambience"];
    const protocol: ProtocolClipAudioRole[] = roles;
    const back: ClipAudioRole[] = clipAudioRole.options;
    expect(back).toEqual(protocol);
  });
});
