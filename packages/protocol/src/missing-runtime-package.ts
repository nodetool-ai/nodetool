/**
 * A feature could not load an optional package that the desktop app installs
 * on request. The error names the package by its runtime package id, so the
 * editor can offer to install it in place instead of sending the user to the
 * Package Manager.
 */

/** Runtime package ids the desktop app can install (see electron definitions). */
export type RuntimePackageId =
  | "python"
  | "nodejs"
  | "ffmpeg"
  | "pandoc"
  | "pdftotext"
  | "yt-dlp"
  | "transformers-js"
  | "tensorflow-js"
  | "node-llama-cpp"
  | "whisper-cpp"
  | "playwright"
  | "claude-agent-sdk"
  | "pdf-js"
  | "office-documents"
  | "tesseract-ocr"
  | "fabric"
  | "email-imap";

/** Display names for the runtime packages, as the Package Manager lists them. */
export const RUNTIME_PACKAGE_NAMES: Readonly<Record<RuntimePackageId, string>> = {
  python: "Python",
  nodejs: "Node.js",
  ffmpeg: "FFmpeg & Codecs",
  pandoc: "Pandoc",
  pdftotext: "PDF Tools (Poppler)",
  "yt-dlp": "yt-dlp",
  "transformers-js": "Transformers.js",
  "tensorflow-js": "TensorFlow.js Models",
  "node-llama-cpp": "llama.cpp (in-process)",
  "whisper-cpp": "whisper.cpp",
  playwright: "Playwright",
  "claude-agent-sdk": "Claude Agent SDK",
  "pdf-js": "PDF Libraries",
  "office-documents": "Office Documents",
  "tesseract-ocr": "Tesseract OCR",
  fabric: "Fabric.js",
  "email-imap": "Email (IMAP)"
};

const MISSING_RUNTIME_PACKAGE = Symbol.for("nodetool.missingRuntimePackage");

export class MissingRuntimePackageError extends Error {
  readonly [MISSING_RUNTIME_PACKAGE] = true;

  constructor(
    message: string,
    readonly runtimePackage: RuntimePackageId,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = "MissingRuntimePackageError";
  }
}

/**
 * The error a feature throws when the npm package it imports is absent. The
 * message names the package and where to install it, so a caller that only
 * shows `message` (an agent, the CLI) still tells the user what to do.
 */
export function missingRuntimePackageError(
  specifier: string,
  runtimePackage: RuntimePackageId,
  cause?: unknown
): MissingRuntimePackageError {
  const name = RUNTIME_PACKAGE_NAMES[runtimePackage];
  return new MissingRuntimePackageError(
    `The optional "${specifier}" package is not installed. Install ${name} from the Package Manager, or run "npm install ${specifier}" where NodeTool runs.`,
    runtimePackage,
    { cause }
  );
}

/**
 * The runtime package a failure is missing, or null. Follows `cause`, because
 * a provider or node can wrap the loader's error in its own.
 */
export function missingRuntimePackageOf(
  error: unknown
): RuntimePackageId | null {
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current instanceof Error; depth++) {
    // The symbol survives a second copy of this module in a bundle, where
    // `instanceof` would not.
    if (
      MISSING_RUNTIME_PACKAGE in current &&
      "runtimePackage" in current
    ) {
      return (current as MissingRuntimePackageError).runtimePackage;
    }
    current = current.cause;
  }
  return null;
}
