/**
 * A missing ffprobe binary (spawn ENOENT) must surface as the actionable
 * MissingBinaryError at every probe site, not get swallowed into a 0/empty
 * return the way a genuine probe failure on corrupt input may.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

let ffprobeMode: "enoent" | "ok" = "enoent";

function enoent(): Error & { code: string } {
  const e = new Error("spawn ffprobe ENOENT") as Error & { code: string };
  e.code = "ENOENT";
  return e;
}

vi.mock("node:child_process", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  const mockExecFile = (_cmd: string, _args: string[]) => undefined;
  (mockExecFile as { [k: symbol]: unknown })[
    Symbol.for("nodejs.util.promisify.custom")
  ] = (cmd: string) => {
    if (cmd === "ffprobe" && ffprobeMode === "enoent") return Promise.reject(enoent());
    return Promise.resolve({ stdout: "", stderr: "" });
  };
  return { ...original, execFile: mockExecFile };
});

const { FpsNode, GetVideoInfoNode, ConcatVideoNode, ForEachFrameNode } =
  await import("@nodetool-ai/video-nodes");

function videoRef(bytes: number[]) {
  return {
    type: "video",
    uri: "",
    data: Buffer.from(new Uint8Array(bytes)).toString("base64")
  };
}

beforeEach(() => {
  ffprobeMode = "enoent";
});

describe("missing ffprobe → MissingBinaryError", () => {
  it("FpsNode surfaces the install error", async () => {
    const node = new FpsNode();
    node.assign({ video: videoRef([1, 2, 3, 4]) });
    await expect(node.process()).rejects.toThrow(/ffprobe is not installed/);
  });

  it("GetVideoInfoNode surfaces the install error", async () => {
    const node = new GetVideoInfoNode();
    node.assign({ video: videoRef([1, 2, 3, 4]) });
    await expect(node.process()).rejects.toThrow(/ffprobe is not installed/);
  });

  it("ForEachFrameNode surfaces the install error from its fps probe", async () => {
    const node = new ForEachFrameNode();
    node.assign({ video: videoRef([1, 2, 3, 4]) });
    // process() drains genProcess, which probes fps first.
    await expect(node.process()).rejects.toThrow(/ffprobe is not installed/);
  });

  it("ConcatVideoNode surfaces the install error from its input probe", async () => {
    const node = new ConcatVideoNode();
    node.setDynamic("a", videoRef([1, 2]));
    node.setDynamic("b", videoRef([3, 4]));
    await expect(node.process()).rejects.toThrow(/ffprobe is not installed/);
  });
});
