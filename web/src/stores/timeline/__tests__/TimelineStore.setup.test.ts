/**
 * TimelineStore guided-setup tests (PRD § 8.5).
 *
 * The setup field is the video flow's whole state: the stage, the brief, the
 * format, the beat plan, and the creator's explicit voiceover choice. Every
 * field is optional and additive, so a sequence that never went through the
 * flow carries no setup at all.
 */

import { describe, it, expect } from "@jest/globals";
import { createTimelineStore } from "../TimelineStore";

const beat = (id: string, prompt: string) => ({
  id,
  prompt,
  duration_ms: 3000
});

describe("TimelineStore setup", () => {
  it("removes one beat and leaves the rest in order", () => {
    const store = createTimelineStore();
    store.getState().setSetup({
      stage: "review",
      brief: "a paper boat's last voyage",
      beats: [
        beat("b1", "the kerb"),
        beat("b2", "the drain"),
        beat("b3", "the sea")
      ]
    });

    store.getState().removeBeat("b2");

    expect(store.getState().setup?.beats?.map((entry) => entry.id)).toEqual([
      "b1",
      "b3"
    ]);
  });

  it("leaves the plan alone for a beat id it does not have", () => {
    const store = createTimelineStore();
    store.getState().setSetup({
      stage: "review",
      brief: "a paper boat's last voyage",
      beats: [beat("b1", "the kerb")]
    });
    store.getState().removeBeat("nope");

    expect(store.getState().setup?.beats?.map((entry) => entry.id)).toEqual([
      "b1"
    ]);
  });

  // F17: silence the creator chose and a line they have not written yet are
  // different states, and only an explicit field can tell them apart.
  it("persists an explicit voiceover choice beside the beats", () => {
    const store = createTimelineStore();
    store.getState().setSetup({
      stage: "look",
      brief: "a paper boat's last voyage",
      beats: [{ ...beat("b1", "the kerb"), voiceover: "It never lasted." }],
      voiceover: false
    });

    expect(store.getState().setup?.voiceover).toBe(false);
    expect(store.getState().setup?.beats?.[0].voiceover).toBe(
      "It never lasted."
    );
  });

  it("says nothing about voiceover until the creator does", () => {
    const store = createTimelineStore();
    store.getState().setSetup({ stage: "idea", brief: "a paper boat" });

    expect(store.getState().setup?.voiceover).toBeUndefined();
  });
});
