import * as path from "path";
import type { RuntimePackageId } from "../../types.d";
import { CondaRuntimePackage } from "./CondaRuntimePackage";
import { NpmRuntimePackage } from "./NpmRuntimePackage";
import { ElectronRuntimePackage } from "./ElectronRuntimePackage";
import type { RuntimePackage } from "./types";
import { MIN_UV_VERSION } from "../../torchruntime";

/** Concrete runtime package definitions. */
export const RUNTIME_PACKAGES = {
  python: new CondaRuntimePackage({
    id: "python",
    name: "Python",
    description:
      "Python interpreter and uv package manager. Required for AI and data processing nodes.",
    category: "language",
    versionRange: ">=3.11 <3.12",
    // The uv that accepts every `--torch-backend` value the app passes.
    condaPackages: ["python=3.11", `uv>=${MIN_UV_VERSION}`],
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

  "transformers-js": new NpmRuntimePackage({
    id: "transformers-js",
    name: "Transformers.js",
    description:
      "Optional Hugging Face Transformers.js runtime (includes the ONNX Runtime) for local JavaScript AI nodes.",
    category: "library",
    // 3.x, not 4.x: kokoro-js 1.2.1 requires @huggingface/transformers
    // ^3.5.1. With 4.x installed npm nested a second 3.x copy under
    // kokoro-js, which cached Kokoro weights inside its own package folder.
    // Keep this inside the range packages/transformers-js-nodes declares.
    versionRange: "3.x",
    npmPackages: ["@huggingface/transformers@3.8.1", "kokoro-js@1.2.1"],
    packageNames: ["@huggingface/transformers", "kokoro-js"],
  }),

  "claude-agent-sdk": new NpmRuntimePackage({
    id: "claude-agent-sdk",
    name: "Claude Agent SDK",
    description:
      "Anthropic's Claude Agent SDK. Powers the Claude Agent LLM provider, which talks to Claude through your logged-in Claude subscription (no API key). Bundles its own claude binary.",
    category: "library",
    versionRange: "0.3.x",
    npmPackages: ["@anthropic-ai/claude-agent-sdk@0.3.283"],
    packageNames: ["@anthropic-ai/claude-agent-sdk"],
    approxSizeMB: 211,
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

  "node-llama-cpp": new NpmRuntimePackage({
    id: "node-llama-cpp",
    name: "llama.cpp (in-process)",
    description:
      "Runs GGUF models inside the NodeTool server — no separate llama.cpp server. Ships Metal on macOS; on Windows and Linux npm pulls the CPU, Vulkan and CUDA builds, which is why the download is large.",
    category: "library",
    versionRange: "3.x",
    npmPackages: ["node-llama-cpp@3.19.1"],
    packageNames: ["node-llama-cpp"],
    // The prebuilt binaries dominate: ~50 MB on macOS (Metal only) versus
    // ~640 MB on Windows / Linux, where npm installs every GPU-backend variant
    // matching the platform (CPU, Vulkan, CUDA, CUDA-ext).
    approxSizeMB: process.platform === "darwin" ? 50 : 640,
  }),
  "whisper-cpp": new NpmRuntimePackage({
    id: "whisper-cpp",
    name: "whisper.cpp",
    description: "Transcribes audio inside the NodeTool backend using local GGML models. Includes CPU and available GPU builds for your platform.",
    category: "library",
    versionRange: "1.1.3",
    npmPackages: ["@fugood/whisper.node@1.1.3"],
    packageNames: ["@fugood/whisper.node"],
    approxSizeMB: process.platform === "darwin" ? 5 : 257,
  }),
  playwright: new NpmRuntimePackage({
    id: "playwright",
    name: "Playwright",
    description:
      "Browser automation library that captures frames of 3D games. The Chromium build it drives is a separate Playwright download.",
    category: "library",
    versionRange: "1.60.x",
    npmPackages: ["playwright@1.60.0"],
    packageNames: ["playwright"],
    approxSizeMB: 12,
  }),
  // The libraries below back individual nodes, sandbox imports and agent
  // tools. The backend loads each through `importOptionalModule` and raises a
  // missing-package error the editor turns into this install.
  "pdf-js": new NpmRuntimePackage({
    id: "pdf-js",
    name: "PDF Libraries",
    description:
      "Reads, extracts and edits PDFs: the PDF nodes, PDF script imports, and the PDF sandbox imports and agent tools.",
    category: "library",
    versionRange: "1.x",
    npmPackages: [
      "@llamaindex/liteparse@1.5.3",
      "pdf-parse@2.4.5",
      "pdf-lib@1.17.1",
    ],
    packageNames: ["@llamaindex/liteparse", "pdf-parse", "pdf-lib"],
    approxSizeMB: 200,
  }),
  "office-documents": new NpmRuntimePackage({
    id: "office-documents",
    name: "Office Documents",
    description:
      "Reads and writes Excel, Word, PowerPoint and EPUB files in Code nodes, agent tools and DOCX script imports.",
    category: "library",
    versionRange: "*",
    npmPackages: [
      "exceljs@4.4.0",
      "docx@9.7.1",
      "mammoth@1.12.1",
      "pptxgenjs@4.0.1",
      "office-text-extractor@4.0.0",
      "epub2@3.0.2",
    ],
    packageNames: [
      "exceljs",
      "docx",
      "mammoth",
      "pptxgenjs",
      "office-text-extractor",
      "epub2",
    ],
    approxSizeMB: 160,
  }),
  "tesseract-ocr": new NpmRuntimePackage({
    id: "tesseract-ocr",
    name: "Tesseract OCR",
    description:
      "Recognizes text in images for the OCR sandbox import. Language data downloads on first use.",
    category: "library",
    versionRange: "7.x",
    npmPackages: ["tesseract.js@7.0.0"],
    packageNames: ["tesseract.js"],
    approxSizeMB: 50,
  }),
  fabric: new NpmRuntimePackage({
    id: "fabric",
    name: "Fabric.js",
    description:
      "Renders Fabric.js canvas scenes to images for the Fabric sandbox import.",
    category: "library",
    versionRange: "7.x",
    npmPackages: ["fabric@7.4.0"],
    packageNames: ["fabric"],
    approxSizeMB: 45,
  }),
  "email-imap": new NpmRuntimePackage({
    id: "email-imap",
    name: "Email (IMAP)",
    description:
      "Searches, archives and labels Gmail messages over IMAP for the email agent tools.",
    category: "library",
    versionRange: "1.x",
    npmPackages: ["imapflow@1.7.1", "mailparser@3.9.15"],
    packageNames: ["imapflow", "mailparser"],
    approxSizeMB: 5,
  }),
} satisfies Record<RuntimePackageId, RuntimePackage>;
