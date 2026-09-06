import { describe, expect, it } from "vitest";
import { getNodeMetadata } from "@nodetool-ai/node-sdk";
import { SaveAudioFileNode } from "@nodetool-ai/audio-nodes";

describe("SaveAudioFile declares only props it uses", () => {
  it("has no FORMAT_MAP prop", () => {
    const names = getNodeMetadata(SaveAudioFileNode).properties.map(
      (p) => p.name
    );
    expect(names).not.toContain("FORMAT_MAP");
  });

  it("keeps the props process() reads", () => {
    const names = getNodeMetadata(SaveAudioFileNode).properties.map(
      (p) => p.name
    );
    expect(names).toEqual(
      expect.arrayContaining([
        "audio",
        "folder",
        "filename",
        "save_to_workspace"
      ])
    );
  });
});
