/**
 * The acestep.cpp `ace-server` runtime: the commit NodeTool pins, the archive
 * a NodeTool workflow builds from it, where it is installed, and the installer
 * the desktop Package Manager and `nodetool runtime add acestep` share.
 *
 * Upstream publishes no tagged release, so `.github/workflows/acestep-build.yml`
 * builds `ace-server` at the pinned commit with Metal, signs and notarizes it
 * and attaches the archive to a NodeTool release. The installer checks the
 * archive against {@link ACESTEP_SHA256} before it unpacks anything.
 *
 * macOS arm64 only. Other platforms report no archive.
 */
import { z } from "zod";
import { importNodeBuiltin } from "./node-import.js";
import { readZipEntries } from "./sd-cpp-runtime.js";

/** The acestep.cpp commit the build and every golden request test target. */
export const ACESTEP_COMMIT = "07abf07da3a9c1c45bd85aabed401644f8eb7c72";

export const ACESTEP_COMMIT_SHORT = ACESTEP_COMMIT.slice(0, 7);

/** The NodeTool release that holds the archive. */
export const ACESTEP_RELEASE_TAG = `acestep-${ACESTEP_COMMIT_SHORT}`;

/**
 * The SHA-256 of the archive the build workflow attaches to the release, as 64
 * lowercase hex digits. It is null until that workflow has run once: the
 * archive does not exist yet, so its digest is unknown. While it is null the
 * installer refuses to install (`AceStepInstallError` code `digest-unset`).
 * After the first build and release, paste the digest the workflow prints
 * here.
 */
export const ACESTEP_SHA256: string | null = "c5ff15f1f56ae3b13fea0a26ea22057ce6b219db1c8d8d5bdff3181d4850269e";

/** The approximate archive size, only used to scale the progress bar. */
const ACESTEP_ARCHIVE_SIZE_BYTES = 30_000_000;

const RELEASE_BASE = `https://github.com/nodetool-ai/nodetool/releases/download/${ACESTEP_RELEASE_TAG}`;

export interface AceStepAsset {
  readonly name: string;
  /** Null until the first build has produced the archive. */
  readonly sha256: string | null;
  readonly sizeBytes: number;
  readonly requirement?: string;
}

const ASSETS = {
  "darwin-arm64": {
    name: `ace-server-${ACESTEP_COMMIT_SHORT}-macos-arm64.zip`,
    sha256: ACESTEP_SHA256,
    sizeBytes: ACESTEP_ARCHIVE_SIZE_BYTES,
    requirement: "macOS 14 or later on Apple silicon"
  }
} satisfies Record<string, AceStepAsset>;

/** The archive for a platform, or null when NodeTool builds none. */
export function aceStepAsset(platform: string, arch: string): AceStepAsset | null {
  return Object.entries(ASSETS).find(([key]) => key === `${platform}-${arch}`)?.[1] ?? null;
}

export function aceStepAssetUrl(asset: AceStepAsset): string {
  return `${RELEASE_BASE}/${asset.name}`;
}

/** The `ace-server` executable inside an install directory. */
export function aceServerPath(installDir: string): string {
  let end = installDir.length;
  while (end > 0 && (installDir[end - 1] === "/" || installDir[end - 1] === "\\")) {
    end--;
  }
  return `${installDir.slice(0, end)}/ace-server`;
}

const MARKER_FILE = "nodetool-acestep.json";
const markerSchema = z.object({ commit: z.string().optional() });

export interface AceStepInstallStatus {
  installed: boolean;
  /** The acestep.cpp commit on disk. */
  version?: string;
}

export async function aceStepInstallStatus(installDir: string): Promise<AceStepInstallStatus> {
  const fs = await importNodeBuiltin<typeof import("node:fs/promises")>("node:fs/promises");
  const path = await importNodeBuiltin<typeof import("node:path")>("node:path");
  if (!fs || !path) {
    return { installed: false };
  }
  try {
    await fs.access(aceServerPath(installDir));
    const marker = markerSchema.safeParse(
      JSON.parse(await fs.readFile(path.join(installDir, MARKER_FILE), "utf8"))
    );
    return { installed: true, version: marker.success ? marker.data.commit : undefined };
  } catch {
    return { installed: false };
  }
}

export type AceStepInstallEvent =
  | { type: "stage"; label: string }
  | { type: "percent"; value: number };

export type AceStepInstallErrorCode =
  | "unsupported-platform"
  | "digest-unset"
  | "download-failed"
  | "digest-mismatch";

export class AceStepInstallError extends Error {
  constructor(
    readonly code: AceStepInstallErrorCode,
    message: string
  ) {
    super(message);
    this.name = "AceStepInstallError";
  }
}

export interface AceStepInstallOptions {
  installDir: string;
  platform: string;
  arch: string;
  signal?: AbortSignal;
  onEvent?: (event: AceStepInstallEvent) => void;
  /** Injected in tests. */
  fetchImpl?: typeof fetch;
  /** Injected in tests: an archive other than the pinned one. */
  asset?: AceStepAsset;
}

/**
 * Download, verify and unpack the pinned archive into `installDir`. It
 * refuses to start while the digest is unset, refuses an archive whose digest
 * differs, and unpacks into a sibling directory that replaces the old install
 * only when complete, so a failed update keeps the working one.
 */
export async function installAceStep(options: AceStepInstallOptions): Promise<AceStepInstallStatus> {
  const { installDir, platform, arch, signal, onEvent } = options;
  const asset = options.asset ?? aceStepAsset(platform, arch);
  if (!asset) {
    throw new AceStepInstallError(
      "unsupported-platform",
      `ace-server is available for macOS on Apple silicon only, not ${platform}-${arch}`
    );
  }
  if (!asset.sha256) {
    throw new AceStepInstallError(
      "digest-unset",
      `${asset.name} has no pinned SHA-256 yet. Run the "Build ace-server" workflow and set ACESTEP_SHA256 in packages/config/src/acestep-runtime.ts.`
    );
  }
  const fs = await importNodeBuiltin<typeof import("node:fs/promises")>("node:fs/promises");
  const path = await importNodeBuiltin<typeof import("node:path")>("node:path");
  const crypto = await importNodeBuiltin<typeof import("node:crypto")>("node:crypto");
  const zlib = await importNodeBuiltin<typeof import("node:zlib")>("node:zlib");
  if (!fs || !path || !crypto || !zlib) {
    throw new Error("Installing ace-server requires Node.js");
  }

  onEvent?.({ type: "stage", label: `Downloading ${asset.name}` });
  const response = await (options.fetchImpl ?? fetch)(aceStepAssetUrl(asset), { signal });
  if (!response.ok || !response.body) {
    throw new AceStepInstallError(
      "download-failed",
      `Download of ${asset.name} failed: HTTP ${response.status}`
    );
  }
  const chunks: Uint8Array[] = [];
  let received = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
    received += value.byteLength;
    onEvent?.({ type: "percent", value: Math.min(99, Math.round((received / asset.sizeBytes) * 100)) });
  }
  const archive = Buffer.concat(chunks);
  const digest = crypto.createHash("sha256").update(archive).digest("hex");
  if (digest !== asset.sha256) {
    throw new AceStepInstallError(
      "digest-mismatch",
      `${asset.name} failed its SHA-256 check (got ${digest}, expected ${asset.sha256})`
    );
  }

  onEvent?.({ type: "stage", label: "Unpacking ace-server" });
  const staging = `${installDir}.partial`;
  await fs.rm(staging, { recursive: true, force: true });
  await fs.mkdir(staging, { recursive: true });
  for (const entry of readZipEntries(archive, zlib)) {
    const target = path.resolve(staging, entry.name);
    if (!target.startsWith(path.resolve(staging) + path.sep)) {
      throw new Error(`${asset.name} holds an entry outside the archive root: ${entry.name}`);
    }
    if (entry.name.endsWith("/")) {
      await fs.mkdir(target, { recursive: true });
      continue;
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, entry.data, { mode: 0o755 });
  }
  await fs.writeFile(
    path.join(staging, MARKER_FILE),
    `${JSON.stringify({ commit: ACESTEP_COMMIT, asset: asset.name })}\n`
  );
  // Mark it executable even when the archive stored no mode.
  await fs.chmod(aceServerPath(staging), 0o755);
  await fs.rm(installDir, { recursive: true, force: true });
  await fs.rename(staging, installDir);
  onEvent?.({ type: "percent", value: 100 });
  return { installed: true, version: ACESTEP_COMMIT };
}

export async function uninstallAceStep(installDir: string): Promise<void> {
  const fs = await importNodeBuiltin<typeof import("node:fs/promises")>("node:fs/promises");
  await fs?.rm(installDir, { recursive: true, force: true });
}
