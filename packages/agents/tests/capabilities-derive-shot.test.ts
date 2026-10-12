/**
 * `derive_shot_from_clip`, end to end over an in-memory database and a real
 * MP4: the frames are decoded and saved as assets, the shot lands after its
 * source with those frames as references, and the timeline gains a track
 * above the source clip with a clip that follows the new shot.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  Asset,
  ModelObserver,
  Storyboard,
  TimelineSequence,
  initTestDb
} from "@nodetool-ai/models";
import type { Shot } from "@nodetool-ai/protocol";
import {
  BufferTarget,
  Mp4OutputFormat,
  Output,
  VideoSample,
  VideoSampleSource,
  getFirstEncodableVideoCodec
} from "mediabunny";
import { registerMediabunnyServer } from "@mediabunny/server";
import { UNGATED, createCapabilityRun } from "../src/capabilities/index.js";
import { capabilityCategoryFor } from "../src/capabilities/registry.js";

registerMediabunnyServer();

const WIDTH = 64;
const HEIGHT = 48;
const FPS = 10;
const FRAMES = 40;
const SOURCE_ASSET = "a".repeat(32);

/** Four seconds: black for the first two, white for the last two. */
async function blackThenWhite(): Promise<Uint8Array> {
  const codec = await getFirstEncodableVideoCodec(
    ["avc", "vp9", "vp8", "av1"],
    { width: WIDTH, height: HEIGHT }
  );
  if (!codec) throw new Error("no encodable video codec on this host");
  const output = new Output({
    format: new Mp4OutputFormat(),
    target: new BufferTarget()
  });
  const source = new VideoSampleSource({
    codec,
    bitrate: 1_000_000,
    hardwareAcceleration: "prefer-software"
  });
  output.addVideoTrack(source, { frameRate: FPS });
  await output.start();
  for (let index = 0; index < FRAMES; index += 1) {
    const value = index < FRAMES / 2 ? 0 : 255;
    const rgba = new Uint8Array(WIDTH * HEIGHT * 4).fill(value);
    for (let pixel = 3; pixel < rgba.length; pixel += 4) rgba[pixel] = 255;
    const sample = new VideoSample(rgba, {
      format: "RGBA",
      codedWidth: WIDTH,
      codedHeight: HEIGHT,
      timestamp: index / FPS,
      duration: 1 / FPS
    });
    await source.add(sample);
    sample.close();
  }
  await output.finalize();
  const buffer = output.target.buffer;
  if (!buffer) throw new Error("encoding produced no bytes");
  return new Uint8Array(buffer);
}

function context(video: Uint8Array) {
  const created: Array<{ id: string; name: string; bytes: Uint8Array }> = [];
  const ctx = {
    userId: "u1",
    hasModelInterface: (name: string) => name === "createAsset",
    createAsset: vi.fn(
      async (args: { name: string; contentType: string; content: Uint8Array }) => {
        const asset = await Asset.create<Asset>({
          user_id: "u1",
          name: args.name,
          content_type: args.contentType
        });
        created.push({ id: asset.id, name: args.name, bytes: args.content });
        return asset;
      }
    ),
    resolveAssetBytes: vi.fn(async (uri: string) => ({
      bytes: uri === `asset://${SOURCE_ASSET}` ? video : null,
      attempts: []
    }))
  } as unknown as ProcessingContext;
  return { ctx, created };
}

const sourceShot: Shot = {
  type: "shot",
  id: "s1",
  index: 0,
  slug: "Blue hour",
  action: "Lights come on along the street",
  camera: "wide",
  status: "rendered",
  entity_ids: ["e1"]
};

async function makeBoard(): Promise<Storyboard> {
  return Storyboard.create<Storyboard>({
    user_id: "u1",
    project_id: "default",
    name: "Board",
    document: JSON.stringify({
      screenplay: null,
      shots: [
        sourceShot,
        { type: "shot", id: "s2", index: 1, action: "Close up", status: "planned" }
      ],
      brief: "",
      style: "",
      entityIds: [],
      aspectRatio: "16:9",
      directorModel: null,
      imageModel: null,
      videoModel: null
    })
  });
}

async function makeTimeline(boardId: string): Promise<TimelineSequence> {
  return TimelineSequence.create<TimelineSequence>({
    user_id: "u1",
    project_id: "default",
    name: "Cut",
    fps: 30,
    width: 1920,
    height: 1080,
    duration_ms: 4000,
    document: JSON.stringify({
      tracks: [
        { id: "t-top", name: "Titles", type: "video", index: 0, visible: true, locked: false },
        { id: "t-shots", name: "Shots", type: "video", index: 1, visible: true, locked: false }
      ],
      clips: [
        {
          id: "clip-1",
          trackId: "t-shots",
          name: "Blue hour",
          startMs: 0,
          durationMs: 4000,
          mediaType: "video",
          sourceType: "imported",
          status: "generated",
          locked: false,
          currentAssetId: SOURCE_ASSET,
          storyboardBoardId: boardId,
          storyboardShotId: "s1",
          versions: []
        },
        {
          id: "clip-unlinked",
          trackId: "t-top",
          name: "Title",
          startMs: 0,
          durationMs: 1000,
          mediaType: "video",
          sourceType: "imported",
          status: "generated",
          locked: false,
          currentAssetId: SOURCE_ASSET,
          versions: []
        }
      ],
      markers: []
    })
  });
}

describe("derive_shot_from_clip", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("is a write capability", () => {
    expect(capabilityCategoryFor("derive_shot_from_clip")).toBe("write");
  });

  it("adds a referenced shot after the source and a linked clip above it", async () => {
    const board = await makeBoard();
    const timeline = await makeTimeline(board.id);
    const { ctx, created } = context(await blackThenWhite());
    const run = createCapabilityRun({ context: ctx, gate: UNGATED });

    const result = (await run.invoke("derive_shot_from_clip", {
      timeline_id: timeline.id,
      clip_id: "clip-1",
      frame_count: 2,
      action: "The same street, seen from a rooftop"
    })) as Record<string, unknown>;

    expect(result["error"]).toBeUndefined();
    expect(created).toHaveLength(2);
    for (const frame of created) {
      expect(frame.name).toMatch(/^Blue hour-frame-\d\.png$/);
      expect([...frame.bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    }

    const doc = (await Storyboard.findById(board.id))!.toDocument();
    const ordered = [...doc.shots].sort((a, b) => a.index - b.index);
    expect(ordered.map((shot) => shot.id)).toEqual([
      "s1",
      result["shot_id"],
      "s2"
    ]);
    const derived = ordered[1];
    expect(derived.action).toBe("The same street, seen from a rooftop");
    expect(derived.slug).toBe("Blue hour (derived)");
    expect(derived.camera).toBe("wide");
    expect(derived.entity_ids).toEqual(["e1"]);
    expect(derived.render_mode).toBe("reference");
    expect(derived.duration_seconds).toBe(4);
    const bindings = derived.production?.reference_bindings ?? [];
    expect(bindings.map((binding) => binding.asset_id)).toEqual(
      created.map((frame) => frame.id)
    );
    // Two frames over four seconds sit in the middle of each half.
    expect(bindings.map((binding) => binding.label)).toEqual([
      "Blue hour at 1.0s",
      "Blue hour at 3.0s"
    ]);

    const cut = (await TimelineSequence.findById(timeline.id))!.toDocument();
    const tracks = [...cut.tracks].sort((a, b) => a.index - b.index);
    expect(tracks.map((track) => track.id)).toEqual([
      "t-top",
      result["track_id"],
      "t-shots"
    ]);
    expect(tracks.map((track) => track.index)).toEqual([0, 1, 2]);
    const clip = cut.clips.find((candidate) => candidate.id === result["clip_id"]);
    expect(clip).toMatchObject({
      trackId: result["track_id"],
      startMs: 0,
      durationMs: 4000,
      mediaType: "video",
      status: "draft",
      storyboardBoardId: board.id,
      storyboardShotId: result["shot_id"]
    });
  });

  it("refuses a clip that follows no shot and writes nothing", async () => {
    const board = await makeBoard();
    const timeline = await makeTimeline(board.id);
    const { ctx, created } = context(await blackThenWhite());
    const run = createCapabilityRun({ context: ctx, gate: UNGATED });

    const result = (await run.invoke("derive_shot_from_clip", {
      timeline_id: timeline.id,
      clip_id: "Title"
    })) as Record<string, unknown>;

    expect(result["error"]).toMatch(/not linked to a storyboard shot/);
    expect(created).toHaveLength(0);
    expect((await Storyboard.findById(board.id))!.toDocument().shots).toHaveLength(2);
  });

  it("refuses a frame count outside 1-8", async () => {
    const board = await makeBoard();
    const timeline = await makeTimeline(board.id);
    const { ctx } = context(new Uint8Array());
    const run = createCapabilityRun({ context: ctx, gate: UNGATED });

    const result = (await run.invoke("derive_shot_from_clip", {
      timeline_id: timeline.id,
      clip_id: "clip-1",
      frame_count: 9
    })) as Record<string, unknown>;

    expect(result["error"]).toMatch(/frame_count/);
  });
});
