/**
 * `yt_dlp` with a `+` selector downloads each side with its own yt-dlp call
 * and muxes them in process, so no ffmpeg runs.
 *
 * A stub `yt-dlp` shell script on PATH copies a video-only or an audio-only
 * fixture to the `-o` template and prints what `--print` asks for. A trap
 * `ffmpeg` on the same PATH records any call. The network guard is stubbed:
 * its own tests cover it, and the URL here is never fetched.
 */

import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { ProcessingContext } from "@nodetool-ai/runtime";
import { createLocalWorkspace } from "@nodetool-ai/runtime";
import { streamCodecs } from "@nodetool-ai/runtime/media";
import { generateMedia } from "@nodetool-ai/runtime/media/testing";

vi.mock("../src/network-guard.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/network-guard.js")>()),
  assertFetchUrlAllowed: () => undefined,
  assertResolvedHostAllowed: async () => undefined
}));

const { toolFromCapability } = await import("../src/capabilities/adapters.js");
const { UNGATED, createCapabilityRun } = await import("../src/capabilities/invoke.js");
const { ytDlp } = await import("../src/capabilities/media.js");

let dir: string;
let workspace: string;
let callLog: string;
let ffmpegMarker: string;
const oldPath = process.env.PATH ?? "";

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "yt-dlp-mux-"));
  workspace = path.join(dir, "workspace");
  const binDir = path.join(dir, "bin");
  await mkdir(workspace);
  await mkdir(binDir);
  callLog = path.join(dir, "calls.log");
  ffmpegMarker = path.join(dir, "ffmpeg-ran");
  const video = path.join(dir, "video-only.mp4");
  const audio = path.join(dir, "audio-only.m4a");
  await generateMedia({ outPath: video, video: { source: "testsrc2=size=64x48:rate=24:duration=1" } });
  await generateMedia({ outPath: audio, audio: { source: "sine=frequency=440:duration=1" } });

  const ytDlpScript = `#!/bin/sh
echo "$*" >> '${callLog}'
outtmpl=""
format=""
print_id=0
while [ $# -gt 0 ]; do
  case "$1" in
    -o) outtmpl="$2"; shift 2 ;;
    -f) format="$2"; shift 2 ;;
    --print) [ "$2" = "after_move:format_id" ] && print_id=1; shift 2 ;;
    *) shift ;;
  esac
done
case "$format" in
  bv*) src='${video}'; fid=137; ext=mp4 ;;
  *) src='${audio}'; fid=140; ext=m4a ;;
esac
out=$(printf '%s' "$outtmpl" | sed "s/%(id)s/clip1/; s/%(format_id)s/$fid/; s/%(ext)s/$ext/")
mkdir -p "$(dirname "$out")"
/bin/cp "$src" "$out"
[ "$print_id" -eq 1 ] && echo "$fid"
echo "$out"
`;
  await writeFile(path.join(binDir, "yt-dlp"), ytDlpScript, "utf8");
  await writeFile(path.join(binDir, "ffmpeg"), `#!/bin/sh\ntouch '${ffmpegMarker}'\nexit 1\n`, "utf8");
  await chmod(path.join(binDir, "yt-dlp"), 0o755);
  await chmod(path.join(binDir, "ffmpeg"), 0o755);
  process.env.PATH = `${binDir}:${oldPath}`;
});

afterAll(async () => {
  process.env.PATH = oldPath;
  await rm(dir, { recursive: true, force: true });
});

function runYtDlp(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const tool = toolFromCapability(ytDlp.spec, ytDlp.impl, (context) =>
    createCapabilityRun({ context, gate: UNGATED })
  );
  const context = { workspace: createLocalWorkspace(workspace) } as unknown as ProcessingContext;
  return tool.process(context, params) as Promise<Record<string, unknown>>;
}

describe("yt_dlp without ffmpeg", () => {
  it("yt_dlp downloads both sides of the default selector and muxes one file", async () => {
    const result = await runYtDlp({ url: "https://example.com/v" });

    expect(result).toMatchObject({ success: true, output_file: "downloads/yt-dlp/clip1.mp4" });
    const calls = (await readFile(callLog, "utf8")).trim().split("\n");
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("-f bv* ");
    expect(calls[1]).toContain("-f ba/b ");
    for (const line of calls) expect(line).not.toMatch(/--merge-output-format|--remux-video|-x /);

    const out = path.join(workspace, "downloads/yt-dlp/clip1.mp4");
    expect(await streamCodecs(out)).toEqual({ video: "h264", audio: "aac" });
    // The per-format files are removed once muxed.
    expect(await readdir(path.join(workspace, "downloads/yt-dlp"))).toEqual(["clip1.mp4"]);
    await expect(stat(ffmpegMarker)).rejects.toThrow();
  });

  it("names the formats when the requested container cannot hold them", async () => {
    const result = await runYtDlp({
      url: "https://example.com/v",
      format: "bv+ba",
      output_file: "out/clip.webm"
    });
    expect(String(result["error"])).toMatch(
      /format "bv" \(clip\.f137\.mp4\) and format "ba" \(clip\.f140\.m4a\) could not be muxed: Cannot stream-copy h264 video with aac audio into webm/
    );
  });

  it("refuses a merge inside parentheses before running yt-dlp", async () => {
    const result = await runYtDlp({ url: "https://example.com/v", format: "(bv+ba)/b" });
    expect(String(result["error"])).toMatch(/merges inside parentheses/);
  });

  it("refuses a side of + that would be read as an option", async () => {
    const result = await runYtDlp({ url: "https://example.com/v", format: "bv+--exec" });
    expect(String(result["error"])).toMatch(/cannot start with/);
  });
});
