import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  index: {
    packs: [
      { id: "video", npm: { name: "@nodetool-ai/video-nodes", version: "1.2.3" }, installBytes: 30, requires: ["audio"], runtimeLibraries: ["imaging"] },
      { id: "audio", npm: { name: "@nodetool-ai/audio-nodes", version: "1.2.3" }, installBytes: 20, requires: ["video"], runtimeLibraries: ["codec", "imaging"] }
    ]
  }
}));
vi.mock("../src/index.js", () => ({ readCatalogIndex: () => state.index }));
const { MissingPackError, createMissingPackError } = await import("../src/errors.js");

describe("missing pack error", () => {
  it("expands dependency cycles once with deterministic runtime and node lists", () => {
    const error = createMissingPackError("video", ["video.B", "video.A", "video.B"]);
    expect(error).toBeInstanceOf(MissingPackError);
    expect(error.details).toEqual({
      error: "missing_pack",
      packs: [
        { id: "audio", npm: "@nodetool-ai/audio-nodes", version: "1.2.3", installBytes: 20, requires: ["video"] },
        { id: "video", npm: "@nodetool-ai/video-nodes", version: "1.2.3", installBytes: 30, requires: ["audio"] }
      ],
      runtimeLibraries: ["codec", "imaging"],
      nodeTypes: ["video.A", "video.B"],
      install: { supported: false, reason: "Pack installs are not available in this version.", command: null },
      restartRequired: false
    });
    expect(error.message).toContain("not installed");
  });

  it("rejects an unknown catalog pack rather than inventing install details", () => {
    expect(() => createMissingPackError("unknown")).toThrow("Unknown node catalog pack: unknown");
  });
});
