import { BaseNode, prop } from "@nodetool/node-sdk";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";

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

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.on("data", (d) => {
      stdout += String(d);
    });
    child.stderr.on("data", (d) => {
      stderr += String(d);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
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

function isValidUrl(url: string): boolean {
  return /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(url);
}

function safeMetadata(info: Record<string, unknown>): Record<string, unknown> {
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
): Record<string, unknown> {
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

export class YtDlpDownloadLibNode extends BaseNode {
  static readonly nodeType = "lib.ytdlp.YtDlpDownload";
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
  static readonly requiredRuntimes = ["yt-dlp"];

  @prop({
    type: "str",
    default: "",
    title: "Url",
    description: "URL of the media to download"
  })
  declare url: any;

  @prop({
    type: "enum",
    default: "video",
    title: "Mode",
    description: "Download mode: video, audio, or metadata only",
    values: ["video", "audio", "metadata"]
  })
  declare mode: any;

  @prop({
    type: "str",
    default: "best",
    title: "Format Selector",
    description: "yt-dlp format selector (e.g., 'best', 'bestvideo+bestaudio')"
  })
  declare format_selector: any;

  @prop({
    type: "str",
    default: "auto",
    title: "Container",
    description: "Output container format (e.g., 'mp4', 'webm', 'auto')"
  })
  declare container: any;

  @prop({
    type: "bool",
    default: false,
    title: "Subtitles",
    description: "Download subtitles if available"
  })
  declare subtitles: any;

  @prop({
    type: "bool",
    default: false,
    title: "Thumbnail",
    description: "Download thumbnail if available"
  })
  declare thumbnail: any;

  @prop({
    type: "bool",
    default: false,
    title: "Overwrite",
    description: "Overwrite existing files"
  })
  declare overwrite: any;

  @prop({
    type: "int",
    default: 0,
    title: "Rate Limit Kbps",
    description: "Rate limit in KB/s (0 = unlimited)",
    min: 0
  })
  declare rate_limit_kbps: any;

  @prop({
    type: "int",
    default: 600,
    title: "Timeout",
    description: "Timeout in seconds",
    min: 1,
    max: 3600
  })
  declare timeout: any;

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
    const thumbnail = Boolean(this.thumbnail ?? false);
    const overwrite = Boolean(this.overwrite ?? false);
    const rateLimitKbps = Number(this.rate_limit_kbps ?? 0);

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
      const parsedInfo = jsonLine
        ? (JSON.parse(jsonLine) as Record<string, unknown>)
        : {};

      const output: Record<string, unknown> = {
        video: {},
        audio: {},
        metadata: safeMetadata(parsedInfo),
        subtitles: "",
        thumbnail: null
      };

      if (mode !== "metadata") {
        const dlArgs = [
          "--no-playlist",
          "--no-warnings",
          "--no-color",
          "--restrict-filenames",
          "-o",
          path.join(tempDir, "%(id)s.%(ext)s")
        ];

        if (!overwrite) dlArgs.push("--no-overwrites");
        if (rateLimitKbps > 0)
          dlArgs.push("--limit-rate", `${Math.trunc(rateLimitKbps)}K`);
        if (subtitles)
          dlArgs.push(
            "--write-subs",
            "--write-auto-subs",
            "--sub-langs",
            "en,en-US,en-GB",
            "--sub-format",
            "srt/vtt/ass/best"
          );
        if (thumbnail) dlArgs.push("--write-thumbnail");

        if (mode === "audio") {
          dlArgs.push("-f", "bestaudio/best", "-x", "--audio-format", "mp3");
        } else {
          dlArgs.push(
            "-f",
            formatSelector === "best"
              ? "bestvideo+bestaudio/best"
              : formatSelector
          );
          if (container !== "auto")
            dlArgs.push("--merge-output-format", container);
        }
        dlArgs.push(url);

        const dlRes = await runCommand("yt-dlp", dlArgs, timeoutMs);
        if (dlRes.exitCode !== 0) {
          throw new Error(
            `yt-dlp download failed: ${dlRes.stderr || dlRes.stdout}`
          );
        }

        const mediaId = typeof parsedInfo.id === "string" ? parsedInfo.id : "";
        if (mode === "audio") {
          const audioFile = await findFileByExt(
            tempDir,
            ["mp3", "m4a", "opus", "ogg", "wav", "webm"],
            mediaId
          );
          if (audioFile)
            output.audio = base64Ref(await fs.readFile(audioFile), "audio");
        } else {
          const videoFile = await findFileByExt(
            tempDir,
            ["mp4", "webm", "mkv", "avi", "mov", "flv"],
            mediaId
          );
          if (videoFile)
            output.video = base64Ref(await fs.readFile(videoFile), "video");
        }

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
