/**
 * `POST /api/assets/:id/extract-audio` hands ffmpeg the video's local file in
 * place (an external asset here) and stores the WAV from disk. A backend with
 * no local file still works by loading the bytes. Runs the real ffmpeg.
 */
import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Asset, initTestDb } from "@nodetool-ai/models";
import {
  FileStorageAdapter,
  InMemoryStorageAdapter,
  type StorageAdapter
} from "@nodetool-ai/storage";

const mocks = vi.hoisted(() => ({ adapter: null as StorageAdapter | null }));
vi.mock("../src/lib/storage.js", async (orig) => ({
  ...(await orig<typeof import("../src/lib/storage.js")>()),
  getAssetAdapter: () => mocks.adapter
}));

import { handleExtractAudio } from "../src/http-api.js";
import { lookupExternalAssetPath } from "../src/lib/external-asset-lookup.js";

const execFileAsync = promisify(execFile);
const USER = "user-1";

let tmp: string;
let withAudio: string;
let silent: string;

function post(): Request {
  return new Request("http://localhost/x", {
    method: "POST",
    headers: { "x-user-id": USER }
  });
}

interface ExtractBody {
  has_audio: boolean;
  asset?: { id: string; content_type: string; size: number; duration: number };
}

beforeAll(async () => {
  tmp = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "extract-audio-path-"))
  );
  withAudio = path.join(tmp, "media", "interview take.mp4");
  silent = path.join(tmp, "media", "silent.mp4");
  await fs.mkdir(path.dirname(withAudio), { recursive: true });
  await execFileAsync("ffmpeg", [
    "-y",
    "-f", "lavfi", "-i", "testsrc=size=32x32:rate=10:duration=1",
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=8000:duration=1",
    "-pix_fmt", "yuv420p", "-shortest",
    withAudio
  ]);
  await execFileAsync("ffmpeg", [
    "-y",
    "-f", "lavfi", "-i", "testsrc=size=32x32:rate=10:duration=1",
    "-pix_fmt", "yuv420p",
    silent
  ]);
}, 60_000);

afterAll(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

beforeEach(() => {
  initTestDb();
});

async function externalVideo(filePath: string): Promise<Asset> {
  return (await Asset.create({
    user_id: USER,
    name: path.basename(filePath),
    content_type: "video/mp4",
    parent_id: USER,
    external_path: filePath
  })) as Asset;
}

describe("handleExtractAudio with a local file", () => {
  it("extracts from the external file in place and stores the WAV from disk", async () => {
    const root = path.join(tmp, "storage-a");
    const adapter = new FileStorageAdapter(root, {
      externalPathLookup: lookupExternalAssetPath
    });
    const retrieve = vi.spyOn(adapter, "retrieve");
    mocks.adapter = adapter;
    const video = await externalVideo(withAudio);

    const res = await handleExtractAudio(post(), {}, video.id);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ExtractBody;
    expect(body.has_audio).toBe(true);
    expect(body.asset?.content_type).toBe("audio/wav");
    expect(body.asset?.duration).toBeCloseTo(1, 1);

    const wav = await fs.readFile(path.join(root, USER, `${body.asset!.id}.wav`));
    expect(wav.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(body.asset?.size).toBe(wav.byteLength);
    // The WAV was thumbnailed from its file.
    await fs.access(path.join(root, USER, `${body.asset!.id}_thumb.jpg`));
    // Neither the video nor the WAV was read back into memory.
    expect(retrieve).not.toHaveBeenCalled();
    // The user's file is untouched and nothing was copied into the store.
    expect((await fs.stat(withAudio)).isFile()).toBe(true);
    expect(await fs.readdir(path.join(root, USER))).toEqual(
      [`${body.asset!.id}.wav`, `${body.asset!.id}_thumb.jpg`].sort()
    );
  });

  it("answers has_audio false for a video with no audio track", async () => {
    mocks.adapter = new FileStorageAdapter(path.join(tmp, "storage-b"), {
      externalPathLookup: lookupExternalAssetPath
    });
    const video = await externalVideo(silent);

    const res = await handleExtractAudio(post(), {}, video.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ has_audio: false });
  });
});

describe("handleExtractAudio on a backend with no local file", () => {
  it("loads the bytes into a temp input and stores the WAV bytes", async () => {
    const adapter = new InMemoryStorageAdapter();
    mocks.adapter = adapter;
    const video = (await Asset.create({
      user_id: USER,
      name: "clip.mp4",
      content_type: "video/mp4",
      parent_id: USER
    })) as Asset;
    await adapter.store(
      `${USER}/${video.id}.mp4`,
      new Uint8Array(await fs.readFile(withAudio))
    );

    const res = await handleExtractAudio(post(), {}, video.id);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ExtractBody;
    expect(body.has_audio).toBe(true);
    const wav = await adapter.retrieve(
      adapter.uriForKey(`${USER}/${body.asset!.id}.wav`)
    );
    expect(Buffer.from(wav!).subarray(0, 4).toString("ascii")).toBe("RIFF");
  });
});
