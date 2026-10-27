import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { isString } from "@nodetool-ai/node-sdk";
import { DEFAULT_YT_DLP_FORMAT, splitYtDlpFormat } from "@nodetool-ai/runtime";
import { muxStreamCopy, transformMedia } from "@nodetool-ai/runtime/media";

type ExecResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

async function runCommand(
  cmd: string,
  args: string[],
  timeoutMs: number
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "pipe" });
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    let killTimer: NodeJS.Timeout | undefined;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      // Escalate if the process ignores SIGTERM.
      killTimer = setTimeout(() => child.kill("SIGKILL"), 5000);
    }, timeoutMs);

    child.stdout.on("data", (d) => {
      stdout += String(d);
    });
    child.stderr.on("data", (d) => {
      stderr += String(d);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      if (timedOut) {
        resolve({
          stdout,
          stderr: `${stderr}\nProcess timed out`,
          exitCode: 124
        });
        return;
      }
      resolve({ stdout, stderr, exitCode: code ?? 0 });
    });
  });
}

// Trust model: the URL is user-supplied and yt-dlp runs on the user's own
// machine (this is a local desktop tool). We only require a well-formed
// http(s) URL — there is deliberately no internal-network/SSRF blocking, since
// the user is free to point this at any host they can already reach.
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

const DEFAULT_SUB_LANGS = "en,en-US,en-GB";

function emptyVideoRef() {
  return { type: "video", uri: "", asset_id: null, data: null, metadata: null };
}

function emptyAudioRef() {
  return { type: "audio", uri: "", asset_id: null, data: null, metadata: null };
}

function emptyImageRef() {
  return { type: "image", uri: "", asset_id: null, data: null, metadata: null };
}

function safeMetadata(info: Record<string, unknown>) {
  const keys = [
    "id",
    "title",
    "description",
    "uploader",
    "upload_date",
    "duration",
    "view_count",
    "like_count",
    "channel",
    "channel_id",
    "webpage_url",
    "ext",
    "width",
    "height",
    "fps",
    "filesize",
    "tags",
    "categories"
  ];
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in info) out[key] = info[key];
  }
  return out;
}

function base64Ref(
  bytes: Buffer,
  kind: "video" | "audio" | "image"
) {
  return {
    type: kind,
    data: bytes.toString("base64")
  };
}

async function findFileByExt(
  dir: string,
  exts: string[],
  preferredId = ""
): Promise<string | null> {
  const names = await fs.readdir(dir);
  const extSet = new Set(exts.map((e) => e.toLowerCase()));

  if (preferredId) {
    const exact = names.find((name) => {
      const ext = path.extname(name).slice(1).toLowerCase();
      const stem = path.basename(name, path.extname(name));
      return stem === preferredId && extSet.has(ext);
    });
    if (exact) return path.join(dir, exact);
  }

  const any = names.find((name) =>
    extSet.has(path.extname(name).slice(1).toLowerCase())
  );
  return any ? path.join(dir, any) : null;
}

/**
 * The file `--print after_move:filepath` named, which must lie in `dir`.
 * Nothing printed on a clean exit means yt-dlp wrote no file.
 */
function printedFile(stdout: string, dir: string, selector: string): string {
  const printed = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);
  if (!printed) {
    throw new Error(`yt-dlp wrote no file for format "${selector}"`);
  }
  const resolved = path.resolve(dir, printed);
  if (path.dirname(resolved) !== path.resolve(dir)) {
    throw new Error(`yt-dlp wrote ${printed}, outside its download directory`);
  }
  return resolved;
}

export class YtDlpDownloadLibNode extends BaseNode {
  static readonly nodeType = "lib.video.download.YtDlpDownload";
  static readonly title = "YouTube Downloader";
  static readonly description =
    "Download media from URLs using yt-dlp.\n    download, video, audio, youtube, media, yt-dlp, metadata, subtitles\n\n    Use cases:\n    - Download videos from YouTube and other platforms\n    - Extract audio from video URLs\n    - Retrieve video/audio metadata without downloading\n    - Download subtitles and thumbnails";
  static readonly metadataOutputTypes = {
    video: "video",
    audio: "audio",
    metadata: "dict",
    subtitles: "str",
    thumbnail: "image"
  };
  static readonly inlineFields: string[] = ["url"];
  static readonly inputFields: string[] = [];
  static readonly requiredRuntimes = ["yt-dlp"];

  @prop({
    type: "str",
    default: "",
    title: "Url",
    description: "URL of the media to download"
  })
  declare url: string;

  @prop({
    type: "enum",
    default: "video",
    title: "Mode",
    description: "Download mode: video, audio, or metadata only",
    values: ["video", "audio", "metadata"]
  })
  declare mode: string;

  @prop({
    type: "str",
    default: "best",
    title: "Format Selector",
    description:
      "yt-dlp format selector (e.g., 'best', 'bestvideo+bestaudio'). Each side of a top-level '+' downloads on its own and the two are muxed without re-encoding. 'best' means 'bv*+ba/b'."
  })
  declare format_selector: string;

  @prop({
    type: "str",
    default: "auto",
    title: "Container",
    description:
      "Container for a muxed video and audio download: auto, mp4, mov, webm or mkv. Auto picks webm or mp4 when it holds both codecs, else mkv. A selector with no '+' keeps the downloaded file's own container."
  })
  declare container: string;

  @prop({
    type: "bool",
    default: false,
    title: "Subtitles",
    description: "Download subtitles if available"
  })
  declare subtitles: boolean;

  @prop({
    type: "str",
    default: DEFAULT_SUB_LANGS,
    title: "Subtitle Languages",
    description:
      "Comma-separated subtitle language codes in yt-dlp syntax (e.g., 'en,en-US,en-GB', 'de.*', 'all'). Only used when Subtitles is enabled."
  })
  declare sub_langs: string;

  @prop({
    type: "bool",
    default: false,
    title: "Thumbnail",
    description: "Download thumbnail if available"
  })
  declare thumbnail: boolean;

  @prop({
    type: "bool",
    default: false,
    title: "Overwrite",
    description: "Overwrite existing files"
  })
  declare overwrite: boolean;

  @prop({
    type: "int",
    default: 0,
    title: "Rate Limit Kbps",
    description: "Rate limit in KB/s (0 = unlimited)",
    min: 0
  })
  declare rate_limit_kbps: number;

  @prop({
    type: "int",
    default: 600,
    title: "Timeout",
    description: "Timeout in seconds",
    min: 1,
    max: 3600
  })
  declare timeout: number;

  async process(): Promise<Record<string, unknown>> {
    const url = String(this.url ?? "").trim();
    if (!url) {
      throw new Error("URL cannot be empty");
    }
    if (!isValidUrl(url)) {
      throw new Error(`Invalid URL format: ${url}`);
    }

    const mode = String(this.mode ?? "video").toLowerCase();
    const timeoutMs = Math.max(1000, Number(this.timeout ?? 600) * 1000);
    const formatSelector = String(this.format_selector ?? "best");
    const container = String(this.container ?? "auto");
    const subtitles = Boolean(this.subtitles ?? false);
    const subLangs = String(this.sub_langs ?? "").trim() || DEFAULT_SUB_LANGS;
    const thumbnail = Boolean(this.thumbnail ?? false);
    const overwrite = Boolean(this.overwrite ?? false);
    const rateLimitKbps = Number(this.rate_limit_kbps ?? 0);

    // Split before any network call, so a selector NodeTool cannot mux fails
    // fast. Audio and metadata modes ignore it.
    const components =
      mode !== "audio" && mode !== "metadata"
        ? splitYtDlpFormat(
            formatSelector.trim() === "best" ? DEFAULT_YT_DLP_FORMAT : formatSelector
          )
        : [];

    // One deadline for the whole node run: the metadata probe and the
    // download share the budget instead of each getting the full timeout.
    const deadline = Date.now() + timeoutMs;
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ytdlp-"));

    try {
      const metadataArgs = [
        "--no-playlist",
        "--no-warnings",
        "--no-color",
        "--print-json",
        "--skip-download",
        url
      ];
      const metadataRes = await runCommand("yt-dlp", metadataArgs, timeoutMs);
      if (metadataRes.exitCode !== 0) {
        throw new Error(
          `yt-dlp metadata failed: ${metadataRes.stderr || metadataRes.stdout}`
        );
      }
      const lines = metadataRes.stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      let jsonLine = "";
      for (let i = lines.length - 1; i >= 0; i -= 1) {
        if (lines[i].startsWith("{")) {
          jsonLine = lines[i];
          break;
        }
      }
      // yt-dlp exited 0 but produced no JSON info line — abnormal output.
      // Downstream download-file naming relies on parsedInfo.id, so a silent
      // {} would break it; fail loudly instead.
      if (!jsonLine) {
        throw new Error(
          "yt-dlp metadata output was malformed: no JSON info line found in stdout"
        );
      }
      let parsedInfo: Record<string, unknown>;
      try {
        parsedInfo = JSON.parse(jsonLine) as Record<string, unknown>;
      } catch (error) {
        throw new Error(
          `yt-dlp metadata output was malformed: could not parse JSON info line (${
            error instanceof Error ? error.message : String(error)
          })`
        );
      }

      const output: Record<string, unknown> = {
        video: emptyVideoRef(),
        audio: emptyAudioRef(),
        metadata: safeMetadata(parsedInfo),
        subtitles: "",
        thumbnail: emptyImageRef()
      };

      if (mode !== "metadata") {
        const baseArgs = [
          "--no-playlist",
          "--no-warnings",
          "--no-color",
          "--restrict-filenames",
          // One file per format: a format selected twice is downloaded once.
          "-o",
          path.join(tempDir, "%(id)s.f%(format_id)s.%(ext)s"),
          "--print",
          "after_move:filepath"
        ];
        if (!overwrite) baseArgs.push("--no-overwrites");
        if (rateLimitKbps > 0)
          baseArgs.push("--limit-rate", `${Math.trunc(rateLimitKbps)}K`);

        // yt-dlp never merges or converts here: those run ffmpeg, which
        // NodeTool does not ship. Each format is its own call, and the mux
        // and the mp3 encode run in process.
        let calls = 0;
        const download = async (selector: string): Promise<string> => {
          const args = [...baseArgs];
          if (calls === 0 && subtitles)
            args.push(
              "--write-subs",
              "--write-auto-subs",
              "--sub-langs",
              subLangs,
              "--sub-format",
              "srt/vtt/ass/best"
            );
          if (calls === 0 && thumbnail) args.push("--write-thumbnail");
          calls += 1;
          args.push("-f", selector, url);
          const remainingMs = deadline - Date.now();
          if (remainingMs <= 0) {
            throw new Error(
              `yt-dlp timed out after ${Math.round(timeoutMs / 1000)}s before downloading format "${selector}"`
            );
          }
          const res = await runCommand("yt-dlp", args, remainingMs);
          if (res.exitCode !== 0) {
            throw new Error(`yt-dlp download failed: ${res.stderr || res.stdout}`);
          }
          return printedFile(res.stdout, tempDir, selector);
        };

        if (mode === "audio") {
          const source = await download("bestaudio/best");
          const mp3 = path.join(tempDir, "nodetool-audio.mp3");
          try {
            await transformMedia({
              inputs: [{ filePath: source }],
              outPath: mp3,
              video: null,
              audio: { filter: "aformat=channel_layouts=mono|stereo" },
              audioCodec: "libmp3lame"
            });
          } catch (error) {
            throw new Error(
              `Could not convert the downloaded audio to mp3: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
          }
          output.audio = base64Ref(await fs.readFile(mp3), "audio");
        } else {
          const files: string[] = [];
          for (const component of components) files.push(await download(component));
          let videoFile = files[0];
          if (files.length === 2) {
            try {
              videoFile = (
                await muxStreamCopy({
                  videoPath: files[0],
                  audioPath: files[1],
                  outStem: path.join(tempDir, "nodetool-muxed"),
                  container
                })
              ).outPath;
            } catch (error) {
              throw new Error(
                `Format "${components[0]}" (${path.basename(files[0])}) and format ` +
                  `"${components[1]}" (${path.basename(files[1])}) could not be muxed: ${
                    error instanceof Error ? error.message : String(error)
                  }`
              );
            }
          }
          output.video = base64Ref(await fs.readFile(videoFile), "video");
        }

        const mediaId = isString(parsedInfo.id) ? parsedInfo.id : "";
        if (subtitles) {
          const subFile = await findFileByExt(
            tempDir,
            ["srt", "vtt", "ass", "ssa"],
            mediaId
          );
          if (subFile) output.subtitles = await fs.readFile(subFile, "utf8");
        }
        if (thumbnail) {
          const thumbFile = await findFileByExt(
            tempDir,
            ["jpg", "jpeg", "png", "webp"],
            mediaId
          );
          if (thumbFile)
            output.thumbnail = base64Ref(await fs.readFile(thumbFile), "image");
        }
      }

      return output;
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }
}

export const LIB_YTDLP_NODES = [YtDlpDownloadLibNode] as const;
