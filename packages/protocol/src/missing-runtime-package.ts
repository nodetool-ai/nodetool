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
  | "claude-agent-sdk";

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
