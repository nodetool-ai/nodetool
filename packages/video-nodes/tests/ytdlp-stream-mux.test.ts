/**
 * Reproduction for dropping ffmpeg: yt-dlp merged a `+` selector by running
 * ffmpeg, so the yt-dlp runtime package had to ship it. The node now
 * downloads each side with its own yt-dlp call and muxes in process.
 *
 * No mocks. A stub `yt-dlp` shell script on PATH plays the real one: it
 * copies a video-only or an audio-only fixture to the `-o` template and
 * prints the path, as `--print after_move:filepath` does. A trap `ffmpeg`
 * on the same PATH records any call, and the test asserts it never ran.
 */

import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { streamCodecs } from "@nodetool-ai/runtime/media";
import { generateMedia } from "@nodetool-ai/runtime/media/testing";

import { YtDlpDownloadLibNode } from "../src/nodes/lib-video-download.js";

let dir: string;
let binDir: string;
let callLog: string;
let ffmpegMarker: string;
const oldPath = process.env.PATH ?? "";

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "ytdlp-stream-mux-"));
  binDir = path.join(dir, "bin");
  callLog = path.join(dir, "yt-dlp-calls.log");
  ffmpegMarker = path.join(dir, "ffmpeg-ran");
  const video = path.join(dir, "video-only.mp4");
  const audio = path.join(dir, "audio-only.m4a");
  await generateMedia({
    outPath: video,
    video: { source: "testsrc2=size=64x48:rate=24:duration=1" }
  });
  await generateMedia({
    outPath: audio,
    audio: { source: "sine=frequency=440:duration=1" }
  });

  const ytDlp = `#!/bin/sh
echo "$*" >> '${callLog}'
outtmpl=""
format=""
json=0
while [ $# -gt 0 ]; do
  case "$1" in
    -o) outtmpl="$2"; shift 2 ;;
    -f) format="$2"; shift 2 ;;
    --print-json) json=1; shift ;;
    *) shift ;;
  esac
done
if [ "$json" -eq 1 ]; then
  echo '{"id":"stub1","title":"Stub","ext":"mp4"}'
  exit 0
fi
case "$format" in
  bv*) src='${video}'; fid=137; ext=mp4 ;;
  *) src='${audio}'; fid=140; ext=m4a ;;
esac
out=$(printf '%s' "$outtmpl" | sed "s/%(id)s/stub1/; s/%(format_id)s/$fid/; s/%(ext)s/$ext/")
/bin/cp "$src" "$out"
echo "$out"
`;
  const ffmpeg = `#!/bin/sh\ntouch '${ffmpegMarker}'\nexit 1\n`;
  await mkdir(binDir);
  await writeFile(path.join(binDir, "yt-dlp"), ytDlp, "utf8");
  await writeFile(path.join(binDir, "ffmpeg"), ffmpeg, "utf8");
  await chmod(path.join(binDir, "yt-dlp"), 0o755);
  await chmod(path.join(binDir, "ffmpeg"), 0o755);
  process.env.PATH = `${binDir}:${oldPath}`;
});

afterAll(async () => {
  process.env.PATH = oldPath;
  await rm(dir, { recursive: true, force: true });
});

describe("YtDlpDownload muxes two stream files without ffmpeg", () => {
  it("downloads bv* and ba/b separately and returns one file with both streams", async () => {
    const result = await new YtDlpDownloadLibNode({
      url: "https://example.com/watch?v=stub1",
      mode: "video"
    }).process();

    const calls = (await readFile(callLog, "utf8")).trim().split("\n");
    const downloads = calls.filter((line) => !line.includes("--print-json"));
    expect(downloads).toHaveLength(2);
    expect(downloads[0]).toContain("-f bv* ");
    expect(downloads[1]).toContain("-f ba/b ");
    for (const line of downloads) {
      expect(line).not.toMatch(/--merge-output-format|--remux-video|--recode-video|--extract-audio| -x /);
    }

    const out = path.join(dir, "muxed.mp4");
    await writeFile(out, Buffer.from((result.video as { data: string }).data, "base64"));
    expect(await streamCodecs(out)).toEqual({ video: "h264", audio: "aac" });

    await expect(stat(ffmpegMarker)).rejects.toThrow();
  });
});
