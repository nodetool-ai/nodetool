import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ConvertTextPandocLibNode,
  ConvertFilePandocLibNode,
  YtDlpDownloadLibNode,
  registerBaseNodes,
} from "../src/index.js";
import { NodeRegistry } from "@nodetool/node-sdk";

async function withMockBins(run: (binDir: string) => Promise<void>): Promise<void> {
  const binDir = await mkdtemp(join(tmpdir(), "nt-mock-bin-"));

  const pandocScript = `#!/bin/sh
from=""
to=""
file=""
while [ $# -gt 0 ]; do
  case "$1" in
    -f) from="$2"; shift 2 ;;
    -t) to="$2"; shift 2 ;;
    -*) shift ;;
    *)
      if [ -z "$file" ]; then file="$1"; fi
      shift ;;
  esac
done
if [ -n "$file" ]; then
  input="$(cat "$file")"
else
  input="$(cat)"
fi
printf "converted(%s->%s):%s" "$from" "$to" "$input"
`;

  const ytdlpScript = `#!/bin/sh
id="mockid"
outtmpl=""
print_json=0
skip_download=0
write_subs=0
write_thumb=0
audio=0
while [ $# -gt 0 ]; do
  case "$1" in
    --print-json) print_json=1; shift ;;
    --skip-download) skip_download=1; shift ;;
    -o) outtmpl="$2"; shift 2 ;;
    --write-subs|--write-auto-subs) write_subs=1; shift ;;
    --write-thumbnail) write_thumb=1; shift ;;
    -x) audio=1; shift ;;
    --audio-format|--sub-langs|--sub-format|--merge-output-format|--limit-rate|-f) shift 2 ;;
    --no-playlist|--no-warnings|--no-color|--restrict-filenames|--no-overwrites) shift ;;
    *) shift ;;
  esac
done
if [ "$print_json" -eq 1 ] && [ "$skip_download" -eq 1 ]; then
  echo '{"id":"mockid","title":"Mock Title","duration":12,"ext":"mp4"}'
  exit 0
fi
if [ -z "$outtmpl" ]; then outtmpl="./%(id)s.%(ext)s"; fi
if [ "$audio" -eq 1 ]; then ext="mp3"; else ext="mp4"; fi
out="$(printf "%s" "$outtmpl" | sed "s/%(id)s/$id/g; s/%(ext)s/$ext/g")"
mkdir -p "$(dirname "$out")"
printf "media-data" > "$out"
if [ "$write_subs" -eq 1 ]; then
  printf "sub text" > "$(dirname "$out")/$id.en.srt"
fi
if [ "$write_thumb" -eq 1 ]; then
  printf "thumb" > "$(dirname "$out")/$id.jpg"
fi
`;

  const pandocPath = join(binDir, "pandoc");
  const ytdlpPath = join(binDir, "yt-dlp");
  await writeFile(pandocPath, pandocScript, "utf8");
  await writeFile(ytdlpPath, ytdlpScript, "utf8");
  await chmod(pandocPath, 0o755);
  await chmod(ytdlpPath, 0o755);

  const oldPath = process.env.PATH ?? "";
  process.env.PATH = `${binDir}:${oldPath}`;
  try {
    await run(binDir);
  } finally {
    process.env.PATH = oldPath;
  }
}

describe("native lib.pandoc and lib.ytdlp", () => {
  it("registers node types", () => {
    const registry = new NodeRegistry();
    registerBaseNodes(registry);
    expect(registry.has("lib.pandoc.ConvertText")).toBe(true);
    expect(registry.has("lib.pandoc.ConvertFile")).toBe(true);
    expect(registry.has("lib.ytdlp.YtDlpDownload")).toBe(true);
  });

  it("converts text and file via pandoc cli", async () => {
    await withMockBins(async () => {
      const textOut = await new ConvertTextPandocLibNode().process({
        content: "# hello",
        input_format: "markdown",
        output_format: "plain",
      });
      expect(textOut.output).toBe("converted(markdown->plain):# hello");

      const inputFile = join(await mkdtemp(join(tmpdir(), "nt-pandoc-in-")), "in.md");
      await writeFile(inputFile, "sample file", "utf8");
      const fileOut = await new ConvertFilePandocLibNode().process({
        input_path: { path: inputFile },
        input_format: "markdown",
        output_format: "plain",
      });
      expect(fileOut.output).toBe("converted(markdown->plain):sample file");
    });
  });

  it("handles ytdlp metadata and download modes", async () => {
    await withMockBins(async () => {
      const metadata = await new YtDlpDownloadLibNode().process({
        url: "https://example.com/video",
        mode: "metadata",
      });
      expect(metadata.metadata).toMatchObject({ id: "mockid", title: "Mock Title" });

      const video = await new YtDlpDownloadLibNode().process({
        url: "https://example.com/video",
        mode: "video",
        subtitles: true,
        thumbnail: true,
      });
      expect(typeof (video.video as { data?: string }).data).toBe("string");
      expect(video.subtitles).toBe("sub text");
      expect(video.thumbnail).not.toBeNull();

      const audio = await new YtDlpDownloadLibNode().process({
        url: "https://example.com/video",
        mode: "audio",
      });
      expect(typeof (audio.audio as { data?: string }).data).toBe("string");
    });
  });
});
