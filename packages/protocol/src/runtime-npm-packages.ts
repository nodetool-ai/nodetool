/**
 * The npm packages behind each runtime package that installs from npm, with
 * exact versions. The desktop Package Manager and `nodetool runtime add`
 * install the same specs into an optional-node root, which
 * `importOptionalModule` falls back to.
 */
import type { RuntimePackageId } from "./missing-runtime-package.js";

export interface RuntimeNpmPackage {
  /** Hosts that include these libraries in their bundled backend. */
  readonly bundledHosts?: readonly ("desktop" | "docker")[];
  /** Full npm install specs with exact versions. */
  readonly npmPackages: readonly string[];
  /** Bare package names, for status checks and uninstall. */
  readonly packageNames: readonly string[];
  /** What the package enables, in one sentence. */
  readonly description: string;
}

export const RUNTIME_NPM_PACKAGES = {
  imaging: {
    npmPackages: ["sharp@0.35.5", "@napi-rs/canvas@0.1.100", "@hyzyla/pdfium@2.1.13"],
    packageNames: ["sharp", "@napi-rs/canvas", "@hyzyla/pdfium"],
    description: "Image codecs, canvas rendering and PDF page rendering.",
    bundledHosts: ["desktop", "docker"]
  },
  typescript: {
    npmPackages: ["typescript@npm:@typescript/typescript6@6.0.2"],
    packageNames: ["typescript"],
    description: "TypeScript compiler and language-service APIs.",
    bundledHosts: ["desktop", "docker"]
  },
  tracing: {
    npmPackages: ["@opentelemetry/core@2.12.0", "@opentelemetry/resources@2.12.0", "@opentelemetry/sdk-trace-base@2.12.0"],
    packageNames: ["@opentelemetry/core", "@opentelemetry/resources", "@opentelemetry/sdk-trace-base"],
    description: "Workflow and agent execution traces.",
    bundledHosts: ["desktop", "docker"]
  },
  esbuild: {
    npmPackages: ["esbuild@0.28.1"],
    packageNames: ["esbuild"],
    description: "JavaScript and TypeScript sandbox dependency builds.",
    bundledHosts: ["desktop", "docker"]
  },
  rapier: {
    npmPackages: ["@dimforge/rapier3d-compat@0.19.3"],
    packageNames: ["@dimforge/rapier3d-compat"],
    description: "Physics simulation for 3D games.",
    bundledHosts: ["desktop", "docker"]
  },
  "media-codecs": {
    // @mediabunny/server depends on node-av; both are listed so the pins match.
    // mediabunny is listed so npm places the version runtime and agents pin
    // beside the server's peer, instead of the newest release.
    npmPackages: ["node-av@6.1.1", "@mediabunny/server@1.54.0", "mediabunny@1.54.0"],
    packageNames: ["node-av", "@mediabunny/server", "mediabunny"],
    description: "FFmpeg-based audio and video decoding, encoding and filtering.",
    bundledHosts: ["desktop", "docker"]
  },
  webgpu: {
    npmPackages: ["webgpu@0.4.0"],
    packageNames: ["webgpu"],
    description: "GPU rendering on Node through Dawn.",
    bundledHosts: ["desktop", "docker"]
  },
  "transformers-js": {
    // 3.x, not 4.x: kokoro-js 1.2.1 requires @huggingface/transformers
    // ^3.5.1. With 4.x installed npm nested a second 3.x copy under
    // kokoro-js, which cached Kokoro weights inside its own package folder.
    // Keep this inside the range packages/transformers-js-nodes declares.
    npmPackages: ["@huggingface/transformers@3.8.1", "kokoro-js@1.2.1"],
    packageNames: ["@huggingface/transformers", "kokoro-js"],
    description: "Local Transformers.js models, including the ONNX Runtime."
  },
  "tensorflow-js": {
    npmPackages: [
      "@tensorflow/tfjs@4.22.0",
      "@tensorflow-models/mobilenet@2.1.1",
      "@tensorflow-models/coco-ssd@2.2.3",
      "@tensorflow-models/qna@1.0.2"
    ],
    packageNames: [
      "@tensorflow/tfjs",
      "@tensorflow-models/mobilenet",
      "@tensorflow-models/coco-ssd",
      "@tensorflow-models/qna"
    ],
    description: "TensorFlow.js image classification, detection and Q&A nodes."
  },
  "node-llama-cpp": {
    npmPackages: ["node-llama-cpp@3.19.1"],
    packageNames: ["node-llama-cpp"],
    description: "GGUF models in process, without a separate llama.cpp server."
  },
  "whisper-cpp": {
    npmPackages: ["@fugood/whisper.node@1.1.3"],
    packageNames: ["@fugood/whisper.node"],
    description: "Local speech-to-text with whisper.cpp."
  },
  playwright: {
    npmPackages: ["playwright@1.60.0"],
    packageNames: ["playwright"],
    description: "Frame capture for 3D games through a headless browser."
  },
  "pdf-js": {
    npmPackages: [
      "@llamaindex/liteparse@1.5.3",
      "pdf-parse@2.4.5",
      "pdf-lib@1.17.1"
    ],
    packageNames: ["@llamaindex/liteparse", "pdf-parse", "pdf-lib"],
    description: "PDF reading, extraction and editing."
  },
  "office-documents": {
    npmPackages: [
      "exceljs@4.4.0",
      "docx@9.7.1",
      "mammoth@1.12.1",
      "pptxgenjs@4.0.1",
      "office-text-extractor@4.0.0",
      "epub2@3.0.2"
    ],
    packageNames: [
      "exceljs",
      "docx",
      "mammoth",
      "pptxgenjs",
      "office-text-extractor",
      "epub2"
    ],
    description: "Excel, Word, PowerPoint and EPUB files."
  },
  "tesseract-ocr": {
    npmPackages: ["tesseract.js@7.0.0"],
    packageNames: ["tesseract.js"],
    description: "Text recognition in images."
  },
  fabric: {
    npmPackages: ["fabric@7.4.0"],
    packageNames: ["fabric"],
    description: "Fabric.js scene rendering."
  },
  "email-imap": {
    npmPackages: ["imapflow@1.7.1", "mailparser@3.9.15"],
    packageNames: ["imapflow", "mailparser"],
    description: "Gmail search, archive and labels over IMAP."
  },
  tokenizer: {
    npmPackages: ["js-tiktoken@1.0.21"],
    packageNames: ["js-tiktoken"],
    description: "Exact LLM token counting, encoding and decoding."
  }
} as const satisfies Partial<Record<RuntimePackageId, RuntimeNpmPackage>>;

export type RuntimeNpmPackageId = keyof typeof RUNTIME_NPM_PACKAGES;

/** Whether an id names a runtime package that installs from npm. */
export function isRuntimeNpmPackageId(
  id: string
): id is RuntimeNpmPackageId {
  return Object.hasOwn(RUNTIME_NPM_PACKAGES, id);
}
