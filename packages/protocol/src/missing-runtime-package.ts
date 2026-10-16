/**
 * A feature could not load an optional package that the desktop app installs
 * on request. The error names the package by its runtime package id, so the
 * editor can offer to install it in place instead of sending the user to the
 * Package Manager.
 */

import { z } from "zod";
import { RUNTIME_NPM_PACKAGES, isRuntimeNpmPackageId } from "./runtime-npm-packages.js";

/** Runtime package ids the desktop app can install (see electron definitions). */
export type RuntimePackageId =
  | "python"
  | "nodejs"
  | "ffmpeg"
  | "pandoc"
  | "pdftotext"
  | "yt-dlp"
  | "rust"
  | "manimgx"
  | "sd-cpp"
  | "transformers-js"
  | "tensorflow-js"
  | "node-llama-cpp"
  | "whisper-cpp"
  | "playwright"
  | "pdf-js"
  | "office-documents"
  | "tesseract-ocr"
  | "fabric"
  | "email-imap"
  | "tokenizer"
  | "imaging"
  | "typescript"
  | "tracing"
  | "rapier"
  | "esbuild";

/** Display names for the runtime packages, as the Package Manager lists them. */
export const RUNTIME_PACKAGE_NAMES: Readonly<Record<RuntimePackageId, string>> = {
  python: "Python",
  nodejs: "Node.js",
  ffmpeg: "FFmpeg & Codecs",
  pandoc: "Pandoc",
  pdftotext: "PDF Tools (Poppler)",
  "yt-dlp": "yt-dlp",
  rust: "Rust",
  manimgx: "ManimGX",
  "sd-cpp": "stable-diffusion.cpp",
  "transformers-js": "Transformers.js",
  "tensorflow-js": "TensorFlow.js Models",
  "node-llama-cpp": "llama.cpp (in-process)",
  "whisper-cpp": "whisper.cpp",
  playwright: "Playwright",
  "pdf-js": "PDF Libraries",
  "office-documents": "Office Documents",
  "tesseract-ocr": "Tesseract OCR",
  fabric: "Fabric.js",
  "email-imap": "Email (IMAP)",
  tokenizer: "Token Counting (js-tiktoken)",
  imaging: "Image & Canvas Libraries",
  typescript: "TypeScript",
  tracing: "Execution Tracing",
  rapier: "3D Game Physics",
  esbuild: "Sandbox Compiler"
};

const MISSING_RUNTIME_PACKAGE = Symbol.for("nodetool.missingRuntimePackage");

export function isRuntimePackageId(value: unknown): value is RuntimePackageId {
  return typeof value === "string" && Object.hasOwn(RUNTIME_PACKAGE_NAMES, value);
}

export const missingRuntimeDetailsSchema = z.object({
  runtimePackage: z.enum(Object.keys(RUNTIME_PACKAGE_NAMES).filter(isRuntimePackageId)),
  missing: z.string(),
  reason: z.enum(["missing", "incompatible", "broken"]),
  managed: z.string().nullable(),
  bringYourOwn: z.string().nullable(),
  restart: z.string().nullable()
});
export type MissingRuntimeDetails = z.infer<typeof missingRuntimeDetailsSchema>;

export interface MissingRuntimeOptions {
  readonly reason?: MissingRuntimeDetails["reason"];
  readonly restart?: string | null;
}

function runtimeEnv(): Record<string, string | undefined> {
  return typeof process === "undefined" ? {} : process.env;
}

/** POSIX shell literals, or PowerShell literals for Windows copy commands. */
export function quoteRuntimeInstallPath(value: string, platform: string): string {
  return platform === "win32" ? `'${value.replaceAll("'", "''")}'`
    : `'${value.replaceAll("'", "'\\''")}'`;
}

export function missingRuntimePackageDetails(
  missing: string,
  runtimePackage: RuntimePackageId,
  options: MissingRuntimeOptions = {},
  env: Record<string, string | undefined> = runtimeEnv(),
  platform: string = typeof process === "undefined" ? "linux" : process.platform
): MissingRuntimeDetails {
  const host = env["NODETOOL_HOST"] ?? "cli";
  const name = RUNTIME_PACKAGE_NAMES[runtimePackage];
  let managed: string | null = host === "desktop" ? `Install ${name} in Settings › Packages.` : null;
  let bringYourOwn: string | null = null;
  let restart: string | null = options.restart ?? null;
  if (isRuntimeNpmPackageId(runtimePackage)) {
    const specs = RUNTIME_NPM_PACKAGES[runtimePackage].npmPackages.join(" ");
    const modules = env["NODETOOL_OPTIONAL_NODE_MODULES"];
    const root = modules?.replace(/[\\/]node_modules[\\/]?$/, "");
    if (host === "cli") { managed = `nodetool runtime add ${runtimePackage}`; }
    if (host === "source") { managed = `npm run dev:nodetool -- runtime add ${runtimePackage}`; }
    if (host === "npx") {
      const version = env["NODETOOL_CLI_VERSION"];
      managed = `npx -p @nodetool-ai/cli${version ? `@${version}` : ""} nodetool runtime add ${runtimePackage}`;
    }
    if (host === "docker") {
      // The registry build argument is migration step 3. Until then only mounting works.
      bringYourOwn = `Mount a node_modules directory holding ${specs}, and set NODETOOL_OPTIONAL_NODE_MODULES to it.`;
    } else if (root && root !== modules) {
      bringYourOwn = `npm install --prefix ${quoteRuntimeInstallPath(root, platform)} ${specs}`;
    }
  } else if (runtimePackage === "python") {
    bringYourOwn = "Or set NODETOOL_PYTHON to a Python 3.11+ that has nodetool-core installed.";
    if (host === "docker") {
      managed = "This server image has no Python worker. Set NODETOOL_ALLOW_PYTHON_BRIDGE_IN_PRODUCTION=1 and NODETOOL_PYTHON to a Python 3.11+ that has nodetool-core installed.";
      bringYourOwn = null;
      restart = "Restart the container.";
    } else if (host !== "desktop") {
      managed = "curl -fsSL https://raw.githubusercontent.com/nodetool-ai/nodetool/main/install.sh | bash";
      if (env["NODETOOL_SERVER_PROCESS"] === "1") { restart = "Restart nodetool serve."; }
    }
  } else if (runtimePackage === "sd-cpp") {
    if (host === "cli") { managed = "nodetool runtime add sd-cpp"; }
    if (host === "source") { managed = "npm run dev:nodetool -- runtime add sd-cpp"; }
    bringYourOwn = "Or set SD_CPP_SERVER_PATH to an sd-server binary from https://github.com/leejet/stable-diffusion.cpp/releases.";
  } else if (runtimePackage === "manimgx") {
    bringYourOwn = "Or put manimgx on PATH (uv tool install manimgx).";
  } else if (runtimePackage === "rust") {
    bringYourOwn = "Or put cargo and rustc on PATH (install Rust from https://rustup.rs).";
  } else {
    const binary = runtimePackage === "ffmpeg" ? "ffmpeg" : runtimePackage === "nodejs" ? "node" : runtimePackage;
    const packages = runtimePackage === "pdftotext" ? "poppler" : binary;
    bringYourOwn = `Or put ${binary} on PATH (brew install ${packages}, apt install ${runtimePackage === "pdftotext" ? "poppler-utils" : packages}).`;
  }
  return { runtimePackage, missing, reason: options.reason ?? "missing", managed, bringYourOwn, restart };
}

/** Shared prose for human-only surfaces. Installation commands match migration step 2. */
export function missingRuntimeText(details: MissingRuntimeDetails): string {
  const name = RUNTIME_PACKAGE_NAMES[details.runtimePackage];
  const subject = isRuntimeNpmPackageId(details.runtimePackage)
    ? `The optional "${details.missing}" package (${name})`
    : details.runtimePackage === "python" ? "The Python worker" : details.missing;
  const state = details.reason === "missing" ? isRuntimeNpmPackageId(details.runtimePackage) ? "is not installed"
    : details.runtimePackage === "python" ? "is not available" : "is not installed or not on PATH"
    : details.reason === "incompatible" ? "has an incompatible version" : "could not be loaded";
  const lines = [`${subject} ${state}.`];
  if (details.managed) { lines.push(details.managed); }
  if (details.bringYourOwn) { lines.push(details.bringYourOwn); }
  if (details.restart) { lines.push(details.restart); }
  return lines.join("\n");
}

export class MissingRuntimePackageError extends Error {
  readonly [MISSING_RUNTIME_PACKAGE] = true;
  readonly details: MissingRuntimeDetails;

  constructor(
    message: string,
    readonly runtimePackage: RuntimePackageId,
    options?: { cause?: unknown; details?: MissingRuntimeDetails }
  ) {
    super(message, options);
    this.name = "MissingRuntimePackageError";
    this.details = options?.details ?? missingRuntimePackageDetails(runtimePackage, runtimePackage);
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
  cause?: unknown,
  options: MissingRuntimeOptions = {}
): MissingRuntimePackageError {
  const details = missingRuntimePackageDetails(specifier, runtimePackage, options);
  return new MissingRuntimePackageError(
    missingRuntimeText(details),
    runtimePackage,
    { cause, details }
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
      "runtimePackage" in current && isRuntimePackageId(current.runtimePackage)
    ) {
      return current.runtimePackage;
    }
    current = current.cause;
  }
  return null;
}

export function missingRuntimeDetailsOf(error: unknown): MissingRuntimeDetails | null {
  let current = error;
  for (let depth = 0; depth < 8 && current instanceof Error; depth += 1) {
    if (MISSING_RUNTIME_PACKAGE in current && "details" in current) {
      const parsed = missingRuntimeDetailsSchema.safeParse(current.details);
      if (parsed.success) { return parsed.data; }
    }
    current = current.cause;
  }
  return null;
}

/** Binaries represented by the existing runtime package registry. */
export function runtimePackageForBinary(binary: string): RuntimePackageId | null {
  const filename = binary.replaceAll("\\", "/").split("/").pop()?.replace(/\.exe$/i, "") ?? binary;
  switch (filename) {
    case "ffmpeg": case "ffprobe": return "ffmpeg";
    case "python": case "python3": return "python";
    case "node": return "nodejs";
    case "rustc": case "cargo": return "rust";
    case "pandoc": return "pandoc";
    case "pdftotext": return "pdftotext";
    case "yt-dlp": return "yt-dlp";
    case "manimgx": return "manimgx";
    case "sd-server": return "sd-cpp";
    default: return null;
  }
}
