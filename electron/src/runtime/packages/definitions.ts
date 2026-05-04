import * as path from "path";
import type { RuntimePackageId } from "../../types.d";
import { CondaRuntimePackage } from "./CondaRuntimePackage";
import { NpmRuntimePackage } from "./NpmRuntimePackage";
import { ElectronRuntimePackage } from "./ElectronRuntimePackage";
import type { RuntimePackage } from "./types";

/**
 * Concrete runtime package definitions. Replaces the previous
 * `RUNTIME_DEFINITIONS` map with instances of the typed base classes.
 */
export const RUNTIME_PACKAGES: Record<RuntimePackageId, RuntimePackage> = {
  python: new CondaRuntimePackage({
    id: "python",
    name: "Python",
    description:
      "Python interpreter and uv package manager. Required for AI and data processing nodes.",
    category: "language",
    versionRange: ">=3.11 <3.12",
    condaPackages: ["python=3.11", "uv"],
    verifyBinary: "python",
    extraBinaries: { uv: "uv" },
    windowsBinSubdir: "Library\\bin",
    postInstall: async () => {
      const { installRequiredPythonPackages } = await import("../../python");
      await installRequiredPythonPackages();
    },
  }),

  nodejs: new ElectronRuntimePackage({
    id: "nodejs",
    name: "Node.js",
    description:
      "JavaScript runtime bundled with Electron. Required for Node.js-based nodes and npm packages.",
    category: "language",
    versionRange: "*",
    binaries: {
      node: (ctx) =>
        ctx.platform === "win32"
          ? path.join(ctx.condaEnvPath, "node.exe")
          : path.join(ctx.condaEnvPath, "bin", "node"),
    },
  }),

  bash: new CondaRuntimePackage({
    id: "bash",
    name: "Bash",
    description: "Bash shell for script execution nodes.",
    category: "language",
    versionRange: "*",
    condaPackages: ["bash"],
    verifyBinary: "bash",
  }),

  ruby: new CondaRuntimePackage({
    id: "ruby",
    name: "Ruby",
    description: "Ruby interpreter for Ruby-based nodes.",
    category: "language",
    versionRange: "*",
    condaPackages: ["ruby"],
    verifyBinary: "ruby",
  }),

  lua: new CondaRuntimePackage({
    id: "lua",
    name: "Lua",
    description: "Lua interpreter for Lua-based nodes.",
    category: "language",
    versionRange: "*",
    condaPackages: ["lua"],
    verifyBinary: "lua",
  }),

  ffmpeg: new CondaRuntimePackage({
    id: "ffmpeg",
    name: "FFmpeg & Codecs",
    description:
      "Audio/video processing toolkit. Required for video nodes and the FFmpeg Agent.",
    category: "tool",
    versionRange: ">=6 <7",
    condaPackages: [
      "ffmpeg>=6,<7",
      "x264",
      "x265",
      "aom",
      "libopus",
      "libvorbis",
      "libpng",
      "libjpeg-turbo",
      "libtiff",
      "openjpeg",
      "libwebp",
      "giflib",
      "lame",
    ],
    verifyBinary: "ffmpeg",
    extraBinaries: { ffprobe: "ffprobe" },
    windowsBinSubdir: "Library\\bin",
  }),

  pandoc: new CondaRuntimePackage({
    id: "pandoc",
    name: "Pandoc",
    description:
      "Universal document converter for text and file format conversion.",
    category: "tool",
    versionRange: "*",
    condaPackages: ["pandoc"],
    verifyBinary: "pandoc",
  }),

  pdftotext: new CondaRuntimePackage({
    id: "pdftotext",
    name: "PDF Tools (Poppler)",
    description:
      "PDF text extraction using pdftotext from poppler. Required for PDF-to-text conversion.",
    category: "tool",
    versionRange: "*",
    condaPackages: ["poppler"],
    verifyBinary: "pdftotext",
  }),

  "yt-dlp": new CondaRuntimePackage({
    id: "yt-dlp",
    name: "yt-dlp",
    description: "Video/audio downloader from YouTube and other sites.",
    category: "tool",
    versionRange: "*",
    condaPackages: ["yt-dlp"],
    verifyBinary: "yt-dlp",
  }),

  "claude-agent-sdk": new NpmRuntimePackage({
    id: "claude-agent-sdk",
    name: "Claude Agent SDK",
    description:
      "Optional Claude Code agent integration for the local NodeTool backend.",
    category: "library",
    versionRange: "0.2.x",
    npmPackages: ["@anthropic-ai/claude-agent-sdk@0.2.126"],
    packageNames: ["@anthropic-ai/claude-agent-sdk"],
  }),

  "codex-sdk": new NpmRuntimePackage({
    id: "codex-sdk",
    name: "OpenAI Codex SDK",
    description:
      "Optional OpenAI Codex agent integration for the local NodeTool backend.",
    category: "library",
    versionRange: "0.128.x",
    npmPackages: ["@openai/codex-sdk@0.128.0"],
    packageNames: ["@openai/codex-sdk"],
  }),

  "transformers-js": new NpmRuntimePackage({
    id: "transformers-js",
    name: "Transformers.js",
    description:
      "Optional Hugging Face Transformers.js runtime for local JavaScript AI nodes.",
    category: "library",
    versionRange: "4.x",
    npmPackages: ["@huggingface/transformers@4.2.0", "kokoro-js@1.2.1"],
    packageNames: ["@huggingface/transformers", "kokoro-js"],
  }),

  "tensorflow-js": new NpmRuntimePackage({
    id: "tensorflow-js",
    name: "TensorFlow.js Models",
    description:
      "Optional TensorFlow.js model packages for image classification, object detection, and Q&A nodes.",
    category: "library",
    versionRange: "4.x",
    npmPackages: [
      "@tensorflow/tfjs@4.22.0",
      "@tensorflow-models/mobilenet@2.1.1",
      "@tensorflow-models/coco-ssd@2.2.3",
      "@tensorflow-models/qna@1.0.2",
    ],
    packageNames: [
      "@tensorflow/tfjs",
      "@tensorflow-models/mobilenet",
      "@tensorflow-models/coco-ssd",
      "@tensorflow-models/qna",
    ],
  }),
};
