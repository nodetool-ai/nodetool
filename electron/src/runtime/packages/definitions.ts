import * as path from "path";
import type { RuntimePackageId } from "../../types.d";
import { CondaRuntimePackage } from "./CondaRuntimePackage";
import { NpmRuntimePackage } from "./NpmRuntimePackage";
import { ElectronRuntimePackage } from "./ElectronRuntimePackage";
import { UvToolRuntimePackage } from "./UvToolRuntimePackage";
import type { RuntimePackage } from "./types";
import {
  RUNTIME_NPM_PACKAGES,
  type RuntimeNpmPackageId
} from "@nodetool-ai/protocol/runtime-npm-packages";
import { MIN_UV_VERSION } from "../../torchruntime";

/** The shared npm specs, copied so the package class owns mutable arrays. */
function npmSpecs(id: RuntimeNpmPackageId): {
  npmPackages: string[];
  packageNames: string[];
} {
  const spec = RUNTIME_NPM_PACKAGES[id];
  return {
    npmPackages: [...spec.npmPackages],
    packageNames: [...spec.packageNames],
  };
}

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

  // Exported games compile with cargo. The platform toolchain cargo links with
  // (MSVC, Xcode's clang, WebKitGTK headers) is not a conda package.
  rust: new CondaRuntimePackage({
    id: "rust",
    name: "Rust",
    description:
      "Rust compiler and cargo. Builds desktop executables of games. Windows also needs the Visual Studio C++ Build Tools, macOS the Xcode Command Line Tools, and Linux the WebKitGTK development packages.",
    category: "language",
    versionRange: ">=1.77",
    condaPackages: ["rust>=1.77"],
    verifyBinary: "cargo",
    extraBinaries: { rustc: "rustc" },
    windowsBinSubdir: "Library\\bin",
    approxSizeMB: 700,
    homepage: "https://www.rust-lang.org",
  }),

  // ManimGX needs Python 3.13, newer than the conda environment's Python, so
  // uv installs it as a tool on a Python of its own.
  manimgx: new UvToolRuntimePackage({
    id: "manimgx",
    name: "ManimGX",
    description:
      "Math and 3D animation engine with Manim's Python API. Required for the ManimGX scene nodes.",
    category: "tool",
    versionRange: "*",
    toolSpec: "manimgx",
    python: "3.13",
    verifyBinary: "manimgx",
    approxSizeMB: 150,
    homepage: "https://github.com/academa-labs/manimgx",
  }),

  "transformers-js": new NpmRuntimePackage({
    id: "transformers-js",
    name: "Transformers.js",
    description:
      "Optional Hugging Face Transformers.js runtime (includes the ONNX Runtime) for local JavaScript AI nodes.",
    category: "library",
    ...npmSpecs("transformers-js"),
    // The pinned 3.x specs and why they stay on 3.x live in RUNTIME_NPM_PACKAGES.
    versionRange: "3.x",
  }),

  "claude-agent-sdk": new NpmRuntimePackage({
    id: "claude-agent-sdk",
    name: "Claude Agent SDK",
    description:
      "Anthropic's Claude Agent SDK. Powers the Claude Agent LLM provider, which talks to Claude through your logged-in Claude subscription (no API key). Bundles its own claude binary.",
    category: "library",
    ...npmSpecs("claude-agent-sdk"),
    versionRange: "0.3.x",
    approxSizeMB: 211,
  }),

  "tensorflow-js": new NpmRuntimePackage({
    id: "tensorflow-js",
    name: "TensorFlow.js Models",
    description:
      "Optional TensorFlow.js model packages for image classification, object detection, and Q&A nodes.",
    category: "library",
    ...npmSpecs("tensorflow-js"),
    versionRange: "4.x",
  }),

  "node-llama-cpp": new NpmRuntimePackage({
    id: "node-llama-cpp",
    name: "llama.cpp (in-process)",
    description:
      "Runs GGUF models inside the NodeTool server — no separate llama.cpp server. Ships Metal on macOS; on Windows and Linux npm pulls the CPU, Vulkan and CUDA builds, which is why the download is large.",
    category: "library",
    ...npmSpecs("node-llama-cpp"),
    versionRange: "3.x",
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
    ...npmSpecs("whisper-cpp"),
    versionRange: "1.1.3",
    approxSizeMB: process.platform === "darwin" ? 5 : 257,
  }),
  playwright: new NpmRuntimePackage({
    id: "playwright",
    name: "Playwright",
    description:
      "Browser automation library that renders timelines in headless Chrome and captures frames of 3D games. It uses an installed Google Chrome, or the Chromium build Playwright downloads separately.",
    category: "library",
    ...npmSpecs("playwright"),
    versionRange: "1.60.x",
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
    ...npmSpecs("pdf-js"),
    versionRange: "1.x",
    approxSizeMB: 200,
  }),
  "office-documents": new NpmRuntimePackage({
    id: "office-documents",
    name: "Office Documents",
    description:
      "Reads and writes Excel, Word, PowerPoint and EPUB files in Code nodes, agent tools and DOCX script imports.",
    category: "library",
    ...npmSpecs("office-documents"),
    versionRange: "*",
    approxSizeMB: 160,
  }),
  "tesseract-ocr": new NpmRuntimePackage({
    id: "tesseract-ocr",
    name: "Tesseract OCR",
    description:
      "Recognizes text in images for the OCR sandbox import. Language data downloads on first use.",
    category: "library",
    ...npmSpecs("tesseract-ocr"),
    versionRange: "7.x",
    approxSizeMB: 50,
  }),
  fabric: new NpmRuntimePackage({
    id: "fabric",
    name: "Fabric.js",
    description:
      "Renders Fabric.js canvas scenes to images for the Fabric sandbox import.",
    category: "library",
    ...npmSpecs("fabric"),
    versionRange: "7.x",
    approxSizeMB: 45,
  }),
  "email-imap": new NpmRuntimePackage({
    id: "email-imap",
    name: "Email (IMAP)",
    description:
      "Searches, archives and labels Gmail messages over IMAP for the email agent tools.",
    category: "library",
    ...npmSpecs("email-imap"),
    versionRange: "1.x",
    approxSizeMB: 5,
  }),
  tokenizer: new NpmRuntimePackage({
    id: "tokenizer",
    name: "Token Counting (js-tiktoken)",
    description: RUNTIME_NPM_PACKAGES.tokenizer.description,
    category: "library",
    ...npmSpecs("tokenizer"),
    versionRange: "1.x",
    approxSizeMB: 22,
  }),
} satisfies Record<RuntimePackageId, RuntimePackage>;
