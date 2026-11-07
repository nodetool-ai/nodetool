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
  clipBypassedFixedEffects,
  timelineMarker,
  type ClipBypassedFixedEffects as ProtocolClipBypassedFixedEffects,
  timelineSequenceResponse,
  type TimelineSequenceResponse,
  type ClipAudioRole as ProtocolClipAudioRole,
  type TimelineMarker as ProtocolTimelineMarker
} from "@nodetool-ai/protocol/api-schemas/timeline.js";
import type {
  ClipAudioRole,
  ClipBypassedFixedEffects,
  TimelineMarker,
  TimelineSequence
} from "../src/types.js";

describe("native editor fields match the protocol", () => {
  it("keeps optional dropFrame in sequence types and protocol reads", () => {
    const sequence: TimelineSequence = {
      id: "s", projectId: "p", name: "Sequence", fps: 30,
      width: 1920, height: 1080, durationMs: 0, tracks: [], clips: [], markers: [],
      createdAt: "", updatedAt: "", dropFrame: true
    };
    const protocol: TimelineSequenceResponse = sequence;
    const back: TimelineSequence = protocol;
    expect(timelineSequenceResponse.parse(back)).toHaveProperty("dropFrame", true);
    expect(timelineSequenceResponse.parse({ ...back, dropFrame: false })).toHaveProperty("dropFrame", false);
    const { dropFrame, ...legacy } = back;
    expect(dropFrame).toBe(true);
    expect(timelineSequenceResponse.parse(legacy)).not.toHaveProperty("dropFrame");
  });

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

  it("keeps a switched-off fixed effect through the schema", () => {
    const stash: ClipBypassedFixedEffects = {
      motion: {
        transform: { position: { x: 4, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, anchor: { x: 0.5, y: 0.5 } },
        curves: [{ property: "rotation", keyframes: [{ t: 0, value: 1, easing: "hold" }] }]
      },
      opacity: { opacity: 0.5, curves: [] },
      volume: { volumeDb: -6 }
    };
    const protocol: ProtocolClipBypassedFixedEffects = stash;
    const back: ClipBypassedFixedEffects = protocol;
    expect(clipBypassedFixedEffects.parse(back)).toEqual(stash);
  });

  it("lists the same audio roles", () => {
    const roles: ClipAudioRole[] = ["dialogue", "music", "sfx", "ambience"];
    const protocol: ProtocolClipAudioRole[] = roles;
    const back: ClipAudioRole[] = clipAudioRole.options;
    expect(back).toEqual(protocol);
  });
});
