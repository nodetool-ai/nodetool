/**
 * @jest-environment node
 */
import { WELCOME_TRACKS } from "../welcomeTracks";
import type { WelcomeTrack } from "../welcomeTracks";

const tracks: WelcomeTrack[] = WELCOME_TRACKS;

describe("WELCOME_TRACKS", () => {
  it("is a non-empty array", () => {
    expect(tracks.length).toBeGreaterThan(0);
  });

  it("has unique ids", () => {
    const ids = tracks.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every track has required string fields", () => {
    for (const t of tracks) {
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.blurb.length).toBeGreaterThan(0);
      expect(t.nodeLabel.length).toBeGreaterThan(0);
      expect(t.workflowName.length).toBeGreaterThan(0);
      expect(t.samplePrompt.length).toBeGreaterThan(0);
      expect(t.modelType.length).toBeGreaterThan(0);
      expect(t.promptInput.length).toBeGreaterThan(0);
      expect(t.outputHandle.length).toBeGreaterThan(0);
    }
  });

  it("every track has a valid hex accent color", () => {
    for (const t of tracks) {
      expect(t.accent).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it("model types use nodetool namespace", () => {
    for (const t of tracks) {
      expect(t.modelType).toMatch(/^nodetool\./);
    }
  });

  it("includes the four core modalities", () => {
    const ids = tracks.map((t) => t.id);
    expect(ids).toContain("image");
    expect(ids).toContain("video");
    expect(ids).toContain("audio");
    expect(ids).toContain("agent");
  });
});
