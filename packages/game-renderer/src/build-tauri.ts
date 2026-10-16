import { spawn } from "node:child_process";
import { access, constants, mkdir, mkdtemp, readdir, rename, rm, rmdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { createCanvas, loadImage, type SKRSContext2D } from "@napi-rs/canvas";
import type { AnyGameDocument } from "@nodetool-ai/protocol";
import { missingRuntimePackageError } from "@nodetool-ai/protocol/missing-runtime-package";
import type { StandaloneAsset } from "./build.js";
import { gameBuildFingerprint } from "./build-fingerprint.js";

/** Tauri releases the generated project pins. Bump the three together. */
export const TAURI_VERSIONS = { tauri: "2.12.1", tauriBuild: "2.7.1", cli: "2.12.1" } as const;

const DEFAULT_PRODUCT_NAME = "NodeTool Game";
const DEFAULT_VERSION = "1.0.0";
const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT_2D = 800;
const MIN_WINDOW = { width: 480, height: 320 } as const;
const MAX_WINDOW = 7680;

export interface TauriAppOptions {
  /** Window title and installer name. Defaults to "NodeTool Game". */
  readonly name?: string;
  /** Reverse-DNS bundle identifier. Defaults to `ai.nodetool.game.<name slug>`. */
  readonly identifier?: string;
  /** Semantic version `MAJOR.MINOR.PATCH`, within the ranges Windows installers accept. */
  readonly version?: string;
  readonly width?: number;
  readonly height?: number;
  /** PNG, JPEG or WebP bytes for the app icon. A generated icon is used when absent. */
  readonly icon?: Uint8Array;
}

export interface BuildTauriGameOptions {
  readonly document: AnyGameDocument;
  readonly outputDir: string;
  readonly resolveAsset: (sourceAssetId: string, signal?: AbortSignal) => Promise<StandaloneAsset | null>;
  readonly app?: TauriAppOptions;
  readonly signal?: AbortSignal;
}

export interface TauriAppMetadata {
  readonly productName: string;
  readonly identifier: string;
  readonly version: string;
  /** Cargo package and executable name. */
  readonly crateName: string;
  readonly width: number;
  readonly height: number;
  readonly sourceRevision: string;
  readonly dimension: "2d" | "3d";
}

export interface TauriGameProject {
  readonly outputDir: string;
  readonly webDir: string;
  readonly tauriDir: string;
  readonly metadata: TauriAppMetadata;
}

function slug(value: string): string {
  return value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48).replace(/-+$/, "");
}

function productName(value: string | undefined): string {
  // Installers use the name as a file name, so drop characters no platform allows there.
  const cleaned = Array.from(value ?? "", (char) => {
    const code = char.charCodeAt(0);
    return code < 32 || code === 127 || '/\\:*?"<>|'.includes(char) ? " " : char;
  }).join("").replace(/\s+/g, " ").trim().slice(0, 64).trim();
  return cleaned || DEFAULT_PRODUCT_NAME;
}

function windowSize(value: number | undefined, fallback: number, minimum: number, label: string): number {
  if (value === undefined) { return fallback; }
  if (!Number.isInteger(value) || value < minimum || value > MAX_WINDOW) {
    throw new Error(`Window ${label} must be an integer from ${minimum} to ${MAX_WINDOW}`);
  }
  return value;
}

/** Resolves and validates the names, version and window size of an exported desktop app. */
export function tauriAppMetadata(document: AnyGameDocument, app: TauriAppOptions = {}): TauriAppMetadata {
  const name = productName(app.name);
  const nameSlug = slug(name) || "game";
  const identifier = app.identifier ?? `ai.nodetool.game.${/^[a-z]/.test(nameSlug) ? nameSlug : `game-${nameSlug}`}`;
  if (!/^[A-Za-z][A-Za-z0-9-]*(\.[A-Za-z0-9-]+)+$/.test(identifier) || identifier.length > 128 || /\.app$/i.test(identifier)) {
    throw new Error("App identifier must be reverse-DNS, such as com.example.mygame, and must not end in .app");
  }
  const version = app.version ?? DEFAULT_VERSION;
  const parts = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  // Windows MSI packages limit major and minor to 255 and patch to 65535.
  if (!parts || Number(parts[1]) > 255 || Number(parts[2]) > 255 || Number(parts[3]) > 65535) {
    throw new Error("App version must be MAJOR.MINOR.PATCH with major and minor at most 255 and patch at most 65535");
  }
  const width = windowSize(app.width, DEFAULT_WIDTH, MIN_WINDOW.width, "width");
  const fallbackHeight = document.schemaVersion === 3
    ? Math.min(MAX_WINDOW, Math.max(MIN_WINDOW.height, Math.round(width / document.presentation.aspectRatio)))
    : DEFAULT_HEIGHT_2D;
  const height = windowSize(app.height, fallbackHeight, MIN_WINDOW.height, "height");
  const crateName = /^[a-z]/.test(nameSlug) ? nameSlug : `game-${nameSlug}`;
  return { productName: name, identifier, version, crateName, width, height, sourceRevision: document.revision,
    dimension: document.schemaVersion === 3 ? "3d" : "2d" };
}

function drawDefaultIcon(context: SKRSContext2D, size: number): void {
  const radius = size * 0.22;
  const gradient = context.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, "#5b8cff");
  gradient.addColorStop(1, "#7a3cff");
  context.fillStyle = gradient;
  context.beginPath();
  context.roundRect(0, 0, size, size, radius);
  context.fill();
  context.fillStyle = "#ffffff";
  context.beginPath();
  context.moveTo(size * 0.38, size * 0.28);
  context.lineTo(size * 0.76, size * 0.5);
  context.lineTo(size * 0.38, size * 0.72);
  context.closePath();
  context.fill();
}

interface RenderedIcon {
  readonly size: number;
  readonly png: Uint8Array;
  readonly rgba: Uint8ClampedArray;
}

async function renderIcons(sizes: readonly number[], source?: Uint8Array): Promise<Map<number, RenderedIcon>> {
  const image = source ? await loadImage(Buffer.from(source)) : null;
  if (image && (image.width < 1 || image.height < 1)) { throw new Error("App icon image is empty"); }
  const icons = new Map<number, RenderedIcon>();
  for (const size of sizes) {
    const canvas = createCanvas(size, size);
    const context = canvas.getContext("2d");
    if (image) {
      // Cover the square so a non-square icon is cropped rather than letterboxed.
      const scale = Math.max(size / image.width, size / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      context.imageSmoothingQuality = "high";
      context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
    } else {
      drawDefaultIcon(context, size);
    }
    icons.set(size, { size, png: new Uint8Array(await canvas.encode("png")), rgba: context.getImageData(0, 0, size, size).data });
  }
  return icons;
}

/** Windows icon: 32-bit BMP entries for small sizes, PNG for 256. */
function encodeIco(icons: readonly RenderedIcon[]): Uint8Array {
  const images = icons.map((icon) => {
    if (icon.size >= 256) { return icon.png; }
    const { size, rgba } = icon;
    const maskStride = Math.ceil(size / 32) * 4;
    const bytes = new Uint8Array(40 + size * size * 4 + maskStride * size);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 40, true);
    view.setInt32(4, size, true);
    view.setInt32(8, size * 2, true);
    view.setUint16(12, 1, true);
    view.setUint16(14, 32, true);
    view.setUint32(20, size * size * 4 + maskStride * size, true);
    for (let y = 0; y < size; y += 1) {
      const row = size - 1 - y;
      for (let x = 0; x < size; x += 1) {
        const from = (row * size + x) * 4;
        const to = 40 + (y * size + x) * 4;
        bytes[to] = rgba[from + 2] ?? 0;
        bytes[to + 1] = rgba[from + 1] ?? 0;
        bytes[to + 2] = rgba[from] ?? 0;
        bytes[to + 3] = rgba[from + 3] ?? 0;
      }
    }
    // The AND mask stays zero: the alpha channel carries transparency.
    return bytes;
  });
  const header = new Uint8Array(6 + 16 * icons.length);
  const view = new DataView(header.buffer);
  view.setUint16(2, 1, true);
  view.setUint16(4, icons.length, true);
  let offset = header.length;
  icons.forEach((icon, index) => {
    const entry = 6 + index * 16;
    header[entry] = icon.size >= 256 ? 0 : icon.size;
    header[entry + 1] = icon.size >= 256 ? 0 : icon.size;
    view.setUint16(entry + 4, 1, true);
    view.setUint16(entry + 6, 32, true);
    view.setUint32(entry + 8, images[index]?.length ?? 0, true);
    view.setUint32(entry + 12, offset, true);
    offset += images[index]?.length ?? 0;
  });
  return Buffer.concat([header, ...images]);
}

/** macOS icon: PNG payloads under the ic07 to ic10 element types. */
function encodeIcns(entries: ReadonlyArray<readonly [string, Uint8Array]>): Uint8Array {
  const chunks = entries.map(([type, png]) => {
    const head = Buffer.alloc(8);
    head.write(type, 0, "ascii");
    head.writeUInt32BE(png.length + 8, 4);
    return Buffer.concat([head, png]);
  });
  const head = Buffer.alloc(8);
  head.write("icns", 0, "ascii");
  head.writeUInt32BE(8 + chunks.reduce((total, chunk) => total + chunk.length, 0), 4);
  return Buffer.concat([head, ...chunks]);
}

const ICON_FILES = ["icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png", "icons/icon.png", "icons/icon.icns", "icons/icon.ico"] as const;

/** Every icon file the Tauri bundler and window need, keyed by path under `src-tauri/`. */
export async function tauriIconFiles(source?: Uint8Array): Promise<Record<string, Uint8Array>> {
  const icons = await renderIcons([16, 32, 48, 128, 256, 512, 1024], source);
  const icon = (size: number): RenderedIcon => {
    const rendered = icons.get(size);
    if (!rendered) { throw new Error(`Icon size ${size} was not rendered`); }
    return rendered;
  };
  return {
    "icons/32x32.png": icon(32).png,
    "icons/128x128.png": icon(128).png,
    "icons/128x128@2x.png": icon(256).png,
    "icons/icon.png": icon(512).png,
    "icons/icon.icns": encodeIcns([["ic07", icon(128).png], ["ic08", icon(256).png], ["ic09", icon(512).png], ["ic10", icon(1024).png]]),
    "icons/icon.ico": encodeIco([icon(16), icon(32), icon(48), icon(256)])
  };
}

/** The text files of the Tauri project, keyed by path relative to the project root. */
export function tauriProjectFiles(metadata: TauriAppMetadata): Record<string, string> {
  const config = {
    $schema: "https://schema.tauri.app/config/2",
    productName: metadata.productName,
    version: metadata.version,
    identifier: metadata.identifier,
    build: { frontendDist: "../dist" },
    app: {
      withGlobalTauri: false,
      windows: [{
        label: "main", title: metadata.productName, width: metadata.width, height: metadata.height,
        minWidth: MIN_WINDOW.width, minHeight: MIN_WINDOW.height, center: true, resizable: true, focus: true,
        // The player handles its own pointer and keyboard input, so file drops stay with the page.
        dragDropEnabled: false
      }],
      // The player's index.html carries its own Content-Security-Policy meta tag.
      security: { csp: null }
    },
    bundle: {
      active: true,
      targets: "all",
      category: "Game",
      shortDescription: metadata.productName,
      icon: [...ICON_FILES]
    }
  };
  const cargo = `[package]
name = ${JSON.stringify(metadata.crateName)}
version = ${JSON.stringify(metadata.version)}
description = ${JSON.stringify(`${metadata.productName}, exported from NodeTool`)}
edition = "2021"
publish = false

# Keeps the project standalone when it is unpacked inside another Cargo workspace.
[workspace]

[build-dependencies]
tauri-build = { version = "=${TAURI_VERSIONS.tauriBuild}", features = [] }

[dependencies]
tauri = { version = "=${TAURI_VERSIONS.tauri}", features = [] }

[features]
# Serve the bundled game from the app itself, so a plain \`cargo build --release\` runs standalone.
default = ["custom-protocol"]
custom-protocol = ["tauri/custom-protocol"]

[profile.release]
codegen-units = 1
lto = true
opt-level = "s"
panic = "abort"
strip = true
`;
  const main = `// Hides the console window of a release build on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running the game");
}
`;
  const packageJson = {
    name: metadata.crateName,
    version: metadata.version,
    private: true,
    scripts: { tauri: "tauri", dev: "tauri dev", build: "tauri build" },
    devDependencies: { "@tauri-apps/cli": TAURI_VERSIONS.cli }
  };
  const readme = `# ${metadata.productName}

A desktop build of a NodeTool ${metadata.dimension.toUpperCase()} game (revision \`${metadata.sourceRevision}\`), packaged with [Tauri](https://tauri.app) ${TAURI_VERSIONS.tauri}.

\`dist/\` holds the exported web player and its assets. \`src-tauri/\` is the native shell that opens it in a window.

## Build

Install Rust and the Tauri system dependencies for your platform: https://v2.tauri.app/start/prerequisites/

Installers (\`.msi\`/\`.exe\` on Windows, \`.app\`/\`.dmg\` on macOS, \`.deb\`/\`.rpm\`/\`.AppImage\` on Linux):

\`\`\`sh
npm install
npm run build
\`\`\`

They are written to \`src-tauri/target/release/bundle/\`.

A single executable without an installer:

\`\`\`sh
cd src-tauri
cargo build --release
\`\`\`

It is written to \`src-tauri/target/release/${metadata.crateName}\` (\`.exe\` on Windows).

## Change the app

The window size, title and identifier (\`${metadata.identifier}\`) are in \`src-tauri/tauri.conf.json\`. Replace the files in \`src-tauri/icons/\` to change the icon, or export again from NodeTool with a new icon.
`;
  return {
    "package.json": `${JSON.stringify(packageJson, null, 2)}\n`,
    "README.md": readme,
    ".gitignore": "node_modules/\n",
    "src-tauri/Cargo.toml": cargo,
    "src-tauri/build.rs": "fn main() {\n    tauri_build::build()\n}\n",
    "src-tauri/src/main.rs": main,
    "src-tauri/tauri.conf.json": `${JSON.stringify(config, null, 2)}\n`,
    "src-tauri/.gitignore": "/target/\n/gen/schemas\n"
  };
}

/** Includes the web runtime, native project templates and generated app icons in cache identity. */
export async function tauriGameRuntimeFingerprint(document: AnyGameDocument, app: TauriAppOptions = {}): Promise<string> {
  const metadata = tauriAppMetadata(document, app);
  const web = document.schemaVersion === 3
    ? await (await import("./build3d.js")).standaloneGame3DRuntimeFingerprint()
    : await (await import("./build.js")).standaloneGameRuntimeFingerprint();
  return gameBuildFingerprint({ format: "nodetool-tauri-v1", web, ...tauriProjectFiles(metadata), ...await tauriIconFiles(app.icon) });
}

/** Exports a game as a Tauri desktop project: the standalone web player plus a native shell around it. */
export async function buildTauriGameProject(options: BuildTauriGameOptions): Promise<TauriGameProject> {
  options.signal?.throwIfAborted();
  const metadata = tauriAppMetadata(options.document, options.app);
  const icons = await tauriIconFiles(options.app?.icon);
  const outputDir = resolve(options.outputDir);
  await mkdir(dirname(outputDir), { recursive: true });
  const staging = await mkdtemp(join(dirname(outputDir), ".nodetool-game-tauri-"));
  try {
    const webDir = join(staging, "dist");
    if (options.document.schemaVersion === 3) {
      const { buildStandaloneGame3D } = await import("./build3d.js");
      await buildStandaloneGame3D({ document: options.document, outputDir: webDir, resolveAsset: options.resolveAsset, signal: options.signal });
    } else {
      const { buildStandaloneGame } = await import("./build.js");
      await buildStandaloneGame({ document: options.document, outputDir: webDir, resolveAsset: (assetId) => options.resolveAsset(assetId, options.signal) });
    }
    options.signal?.throwIfAborted();
    const files: Record<string, string | Uint8Array> = { ...tauriProjectFiles(metadata) };
    for (const [path, bytes] of Object.entries(icons)) { files[`src-tauri/${path}`] = bytes; }
    for (const [path, content] of Object.entries(files)) {
      await mkdir(dirname(join(staging, path)), { recursive: true });
      await writeFile(join(staging, path), content);
    }
    options.signal?.throwIfAborted();
    let existing: string[] | undefined;
    try { existing = await readdir(outputDir); }
    catch (error) { if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") { throw error; } }
    if (existing && existing.length > 0) { throw new Error(`Output directory is not empty: ${outputDir}`); }
    if (existing) { await rmdir(outputDir); }
    await rename(staging, outputDir);
    return { outputDir, webDir: join(outputDir, "dist"), tauriDir: join(outputDir, "src-tauri"), metadata };
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

export interface CompileTauriGameOptions {
  readonly cargo?: string;
  readonly signal?: AbortSignal;
  readonly env?: NodeJS.ProcessEnv;
  readonly onOutput?: (chunk: string) => void;
}

async function executable(path: string): Promise<boolean> {
  try { await access(path, constants.X_OK); return true; }
  catch { return false; }
}

/**
 * The cargo to run: the first on PATH, else rustup's. An app started from the
 * macOS Finder or a Windows shortcut has no shell profile, so rustup's
 * `~/.cargo/bin` is often installed but missing from PATH.
 */
export async function findCargo(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): Promise<string | null> {
  const name = platform === "win32" ? "cargo.exe" : "cargo";
  const pathKey = Object.keys(env).find((key) => key.toUpperCase() === "PATH");
  const directories = (pathKey ? env[pathKey] ?? "" : "").split(platform === "win32" ? ";" : delimiter).filter(Boolean);
  const cargoHome = env["CARGO_HOME"] || join(env["HOME"] || env["USERPROFILE"] || homedir(), ".cargo");
  for (const directory of [...directories, join(cargoHome, "bin")]) {
    const candidate = join(directory, name);
    if (await executable(candidate)) { return candidate; }
  }
  return null;
}


/** Compiles an exported project into a release executable with `cargo build --release`. */
export async function compileTauriGameProject(project: Pick<TauriGameProject, "tauriDir" | "metadata">, options: CompileTauriGameOptions = {}): Promise<{ binaryPath: string }> {
  const env = options.env ?? process.env;
  const cargo = options.cargo ?? await findCargo(env);
  if (!cargo) { throw missingRuntimePackageError("cargo", "rust"); }
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(cargo, ["build", "--release"], { cwd: project.tauriDir, env, signal: options.signal,
      stdio: ["ignore", "pipe", "pipe"] });
    let tail = "";
    const collect = (chunk: Buffer): void => {
      const text = chunk.toString("utf8");
      tail = (tail + text).slice(-4000);
      options.onOutput?.(text);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("error", (error) => {
      reject("code" in error && error.code === "ENOENT" ? missingRuntimePackageError("cargo", "rust", error) : error);
    });
    child.on("close", (code) => {
      if (code === 0) { resolvePromise(); } else { reject(new Error(`cargo build failed with exit code ${code}\n${tail}`)); }
    });
  });
  const targetDir = env["CARGO_TARGET_DIR"] ? resolve(project.tauriDir, env["CARGO_TARGET_DIR"]) : join(project.tauriDir, "target");
  const binaryName = process.platform === "win32" ? `${project.metadata.crateName}.exe` : project.metadata.crateName;
  return { binaryPath: join(targetDir, "release", binaryName) };
}
