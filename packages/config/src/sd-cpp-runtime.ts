/**
 * The stable-diffusion.cpp `sd-server` runtime: the release NodeTool pins,
 * where it is installed, and the installer the desktop Package Manager and
 * `nodetool runtime add sd-cpp` share.
 *
 * The binaries come from the upstream GitHub release. Each archive is checked
 * against the SHA-256 digest GitHub publishes for it before it is unpacked.
 */
import { z } from "zod";
import { importNodeBuiltin } from "./node-import.js";

/** The upstream release tag. Upstream publishes one build per master commit. */
export const SD_CPP_RELEASE_TAG = "master-968-8cd731e";

const RELEASE_BASE = `https://github.com/leejet/stable-diffusion.cpp/releases/download/${SD_CPP_RELEASE_TAG}`;

export interface SdCppAsset {
  readonly name: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  /** Shown when the platform has a requirement the installer cannot check. */
  readonly requirement?: string;
}

/**
 * One archive per platform. macOS ships one universal build. Windows and
 * Linux use the Vulkan build, which runs on every GPU vendor with a current
 * driver.
 */
const ASSETS = {
  darwin: {
    name: "sd-master-8cd731e-bin-Darwin-macOS-26.6.2-arm64.zip",
    sha256: "767ce7a876fe4e6727c2020bc0593dd809d6a43a6a8b495c92837bf7449b9068",
    sizeBytes: 35250705,
    requirement: "macOS 26 or later"
  },
  "linux-x64": {
    name: "sd-master-8cd731e-bin-Linux-Ubuntu-24.04-x86_64-vulkan.zip",
    sha256: "1e82f932a678e28035d64bc9909b9c122c6ec0f92fcfd8e9ac2bea99b5619505",
    sizeBytes: 37047375,
    requirement: "a Vulkan driver (libvulkan.so.1)"
  },
  "win32-x64": {
    name: "sd-master-8cd731e-bin-win-vulkan-x64.zip",
    sha256: "060767935e2543c27e0fcd5a024f62d978970c221c60658da87c768c27a841fa",
    sizeBytes: 30163610
  }
} satisfies Record<string, SdCppAsset>;

/** The archive for a platform, or null when upstream ships none. */
export function sdCppAsset(platform: string, arch: string): SdCppAsset | null {
  const keys = [platform, `${platform}-${arch}`];
  return Object.entries(ASSETS).find(([key]) => keys.includes(key))?.[1] ?? null;
}

export function sdCppAssetUrl(asset: SdCppAsset): string {
  return `${RELEASE_BASE}/${asset.name}`;
}

/** The `sd-server` executable inside an install directory. */
export function sdServerPath(installDir: string, platform: string): string {
  const separator = platform === "win32" ? "\\" : "/";
  const name = platform === "win32" ? "sd-server.exe" : "sd-server";
  // Trim trailing separators with a loop: a `[\\/]+$` regex takes quadratic
  // time on a path of many slashes.
  let end = installDir.length;
  while (end > 0 && (installDir[end - 1] === "/" || installDir[end - 1] === "\\")) {
    end--;
  }
  return `${installDir.slice(0, end)}${separator}${name}`;
}

const MARKER_FILE = "nodetool-sd-cpp.json";
const markerSchema = z.object({ tag: z.string().optional() });

export interface SdCppInstallStatus {
  installed: boolean;
  /** The release tag on disk. */
  version?: string;
}

export async function sdCppInstallStatus(
  installDir: string,
  platform: string
): Promise<SdCppInstallStatus> {
  const fs = await importNodeBuiltin<typeof import("node:fs/promises")>("node:fs/promises");
  const path = await importNodeBuiltin<typeof import("node:path")>("node:path");
  if (!fs || !path) {
    return { installed: false };
  }
  try {
    await fs.access(sdServerPath(installDir, platform));
    const marker = markerSchema.safeParse(
      JSON.parse(await fs.readFile(path.join(installDir, MARKER_FILE), "utf8"))
    );
    return { installed: true, version: marker.success ? marker.data.tag : undefined };
  } catch {
    return { installed: false };
  }
}

export type SdCppInstallEvent =
  | { type: "stage"; label: string }
  | { type: "percent"; value: number };

export interface SdCppInstallOptions {
  installDir: string;
  platform: string;
  arch: string;
  signal?: AbortSignal;
  onEvent?: (event: SdCppInstallEvent) => void;
  /** Injected in tests. */
  fetchImpl?: typeof fetch;
  /** Injected in tests: an archive other than the pinned one. */
  asset?: SdCppAsset;
}

/**
 * Download, verify and unpack the pinned release into `installDir`. The
 * archive unpacks into a sibling directory first and replaces the old install
 * only after it is complete, so a failed update keeps the working one.
 */
export async function installSdCpp(options: SdCppInstallOptions): Promise<SdCppInstallStatus> {
  const { installDir, platform, arch, signal, onEvent } = options;
  const asset = options.asset ?? sdCppAsset(platform, arch);
  if (!asset) {
    throw new Error(`stable-diffusion.cpp has no prebuilt sd-server for ${platform}-${arch}`);
  }
  const fs = await importNodeBuiltin<typeof import("node:fs/promises")>("node:fs/promises");
  const path = await importNodeBuiltin<typeof import("node:path")>("node:path");
  const crypto = await importNodeBuiltin<typeof import("node:crypto")>("node:crypto");
  const zlib = await importNodeBuiltin<typeof import("node:zlib")>("node:zlib");
  if (!fs || !path || !crypto || !zlib) {
    throw new Error("Installing sd-server requires Node.js");
  }

  onEvent?.({ type: "stage", label: `Downloading ${asset.name}` });
  const response = await (options.fetchImpl ?? fetch)(sdCppAssetUrl(asset), { signal });
  if (!response.ok || !response.body) {
    throw new Error(`Download of ${asset.name} failed: HTTP ${response.status}`);
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
    throw new Error(`${asset.name} failed its SHA-256 check (got ${digest})`);
  }

  onEvent?.({ type: "stage", label: "Unpacking sd-server" });
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
    `${JSON.stringify({ tag: SD_CPP_RELEASE_TAG, asset: asset.name })}\n`
  );
  await fs.access(sdServerPath(staging, platform));
  await fs.rm(installDir, { recursive: true, force: true });
  await fs.rename(staging, installDir);
  onEvent?.({ type: "percent", value: 100 });
  return { installed: true, version: SD_CPP_RELEASE_TAG };
}

export async function uninstallSdCpp(installDir: string): Promise<void> {
  const fs = await importNodeBuiltin<typeof import("node:fs/promises")>("node:fs/promises");
  await fs?.rm(installDir, { recursive: true, force: true });
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/**
 * Read a zip archive's files through its central directory. The release
 * archives use only the stored and deflate methods and are far below the
 * ZIP64 limits, so nothing else is accepted.
 */
export function readZipEntries(
  archive: Buffer,
  zlib: Pick<typeof import("node:zlib"), "inflateRawSync">
): ZipEntry[] {
  const endSignature = 0x06054b50;
  let end = -1;
  for (let i = archive.length - 22; i >= Math.max(0, archive.length - 65557); i--) {
    if (archive.readUInt32LE(i) === endSignature) {
      end = i;
      break;
    }
  }
  if (end < 0) {
    throw new Error("Not a zip archive");
  }
  const count = archive.readUInt16LE(end + 10);
  let offset = archive.readUInt32LE(end + 16);
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (archive.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error("Corrupt zip central directory");
    }
    const method = archive.readUInt16LE(offset + 10);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localOffset = archive.readUInt32LE(offset + 42);
    const name = archive.toString("utf8", offset + 46, offset + 46 + nameLength);
    offset += 46 + nameLength + extraLength + commentLength;

    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const raw = archive.subarray(start, start + compressedSize);
    if (method === 0) {
      entries.push({ name, data: raw });
    } else if (method === 8) {
      entries.push({ name, data: zlib.inflateRawSync(raw) });
    } else {
      throw new Error(`Unsupported zip compression method ${method} for ${name}`);
    }
  }
  return entries;
}
