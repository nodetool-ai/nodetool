import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { SaveAudioFileNode, SaveAudioNode } from "@nodetool-ai/audio-nodes";

const ASSET_ID = "7a5835f86af44d878e875730d37b05ca";
const AUDIO = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4]);

/** A context whose only byte source is the asset resolver. */
function assetContext(): ProcessingContext {
  return {
    resolveAssetBytes: async (uri: string) => ({
      bytes: uri === `asset://${ASSET_ID}` ? AUDIO : null,
      attempts: []
    })
  } as unknown as ProcessingContext;
}

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "nodetool-save-audio-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("save nodes write the bytes behind an asset ref", () => {
  it("SaveAudioFile writes an asset:// audio", async () => {
    const node = new SaveAudioFileNode();
    node.assign({
      audio: { type: "audio", uri: `asset://${ASSET_ID}`, asset_id: ASSET_ID },
      folder: { type: "folder", uri: dir },
      filename: "out.wav",
      save_to_workspace: false
    });
    const result = await node.process(assetContext());
    expect(new Uint8Array(await readFile(String(result.output)))).toEqual(AUDIO);
  });

  it("SaveAudio writes an audio that carries only an asset_id", async () => {
    const node = new SaveAudioNode();
    node.assign({
      audio: { type: "audio", uri: "", asset_id: ASSET_ID },
      folder: { type: "folder", uri: dir },
      name: "out.wav"
    });
    await node.process(assetContext());
    expect(new Uint8Array(await readFile(path.join(dir, "out.wav")))).toEqual(AUDIO);
  });
});
