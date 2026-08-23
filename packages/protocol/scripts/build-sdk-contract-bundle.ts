import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { generateSdkProtocolArtifacts } from "./generate-sdk-protocol.js";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(PACKAGE_ROOT, "../..");
const FIXTURES_DIR = join(PACKAGE_ROOT, "fixtures");
const COMPATIBILITY_DOC = join(
  REPO_ROOT,
  "docs/sdk/protocol-v1-compatibility.md"
);

export const BUNDLE_INDEX_FILE = "sdk-v1.bundle.json";
export const BUNDLE_FORMAT = 1;
const STAGING_DIR_NAME = "sdk-contract-bundle";
const TAR_BLOCK = 512;
const TAR_RECORD = 10240;
const TEXT_EXTENSIONS = [".json", ".md", ".txt"];

export type SdkContractBundleFileEntry = {
  readonly path: string;
  readonly sha256: string;
  readonly size: number;
};

export type SdkContractBundleIndex = {
  readonly bundle_digest: string;
  readonly bundle_format: typeof BUNDLE_FORMAT;
  readonly commit: string;
  readonly files: readonly SdkContractBundleFileEntry[];
  readonly generated_from: string;
  readonly protocol_version: string;
  readonly release: string | null;
};

export type SdkContractBundleResult = {
  readonly index: SdkContractBundleIndex;
  readonly indexContent: string;
  readonly stagingDir: string;
  readonly tarName: string;
  readonly tarPath: string;
  readonly tarPrefix: string;
};

export type SdkContractBundleOptions = {
  readonly commit: string;
  /** Parent directory for the staging dir and the tar. Default: `<package>/dist`. */
  readonly outDir?: string;
  readonly release?: string | null;
};

function sha256Hex(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function isTextPath(path: string): boolean {
  return TEXT_EXTENSIONS.some((extension) => path.endsWith(extension));
}

/**
 * Bundle bytes must not depend on the checkout's line-ending configuration,
 * so text files are normalized to LF before hashing and staging.
 */
function normalizeContent(path: string, content: Buffer): Buffer {
  if (!isTextPath(path)) {
    return content;
  }
  return Buffer.from(
    content.toString("utf8").replaceAll("\r\n", "\n"),
    "utf8"
  );
}

function walkFiles(root: string): string[] {
  const files: string[] = [];
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop();
    if (directory === undefined) {
      break;
    }
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        pending.push(path);
      } else if (entry.isFile()) {
        files.push(path);
      }
    }
  }
  return files.sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0
  );
}

function toBundlePath(root: string, path: string): string {
  return relative(root, path).split("\\").join("/");
}

function readProtocolVersion(operationsManifest: string): string {
  const parsed: unknown = JSON.parse(operationsManifest);
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    !("protocol_version" in parsed) ||
    typeof parsed.protocol_version !== "string"
  ) {
    throw new Error(
      "sdk-v1.operations.json does not declare a string protocol_version"
    );
  }
  return parsed.protocol_version;
}

function collectBundleContents(): Map<string, Buffer> {
  const contents = new Map<string, Buffer>();

  const artifacts = generateSdkProtocolArtifacts();
  for (const [name, content] of Object.entries(artifacts)) {
    contents.set(`schema/${name}`, Buffer.from(content, "utf8"));
  }

  for (const path of walkFiles(FIXTURES_DIR)) {
    const bundlePath = `fixtures/${toBundlePath(FIXTURES_DIR, path)}`;
    contents.set(bundlePath, normalizeContent(bundlePath, readFileSync(path)));
  }

  const compatibilityPath = "docs/protocol-v1-compatibility.md";
  contents.set(
    compatibilityPath,
    normalizeContent(compatibilityPath, readFileSync(COMPATIBILITY_DOC))
  );

  return contents;
}

function sortedPaths(contents: ReadonlyMap<string, Buffer>): string[] {
  return [...contents.keys()].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0
  );
}

/**
 * The bundle digest is the SHA-256 of the sorted `sha256sum`-style lines of
 * every bundled file except the index itself, which carries the digest.
 */
export function computeBundleDigest(
  files: readonly SdkContractBundleFileEntry[]
): string {
  const lines = files
    .map((file) => `${file.sha256}  ${file.path}\n`)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  return sha256Hex(Buffer.from(lines.join(""), "utf8"));
}

function octal(value: number, length: number): string {
  return `${value.toString(8).padStart(length - 1, "0")} `;
}

function tarHeader(name: string, size: number): Buffer {
  if (Buffer.byteLength(name, "utf8") > 100) {
    throw new Error(`Tar entry name exceeds the 100-byte USTAR limit: ${name}`);
  }
  const header = Buffer.alloc(TAR_BLOCK);
  header.write(name, 0, 100, "utf8");
  header.write("0000644\0", 100, 8, "ascii");
  header.write("0000000\0", 108, 8, "ascii");
  header.write("0000000\0", 116, 8, "ascii");
  header.write(octal(size, 12), 124, 12, "ascii");
  header.write(octal(0, 12), 136, 12, "ascii");
  header.write("        ", 148, 8, "ascii");
  header.write("0", 156, 1, "ascii");
  header.write("ustar", 257, 6, "ascii");
  header.write("00", 263, 2, "ascii");
  let checksum = 0;
  for (const byte of header) {
    checksum += byte;
  }
  header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
  return header;
}

function padToBlock(size: number, block: number): Buffer {
  const remainder = size % block;
  return Buffer.alloc(remainder === 0 ? 0 : block - remainder);
}

/**
 * A minimal deterministic USTAR writer: fixed metadata (mtime 0, uid/gid 0,
 * mode 0644), entries in sorted path order, and a fixed 10240-byte record
 * size. System tar is deliberately not used — its archive metadata varies
 * across platforms and invocations.
 */
export function buildDeterministicTar(
  entries: ReadonlyMap<string, Buffer>,
  prefix: string
): Buffer {
  const chunks: Buffer[] = [];
  for (const path of sortedPaths(entries)) {
    const content = entries.get(path);
    if (content === undefined) {
      continue;
    }
    chunks.push(tarHeader(`${prefix}/${path}`, content.length));
    chunks.push(content);
    chunks.push(padToBlock(content.length, TAR_BLOCK));
  }
  chunks.push(Buffer.alloc(2 * TAR_BLOCK));
  const size = chunks.reduce((total, chunk) => total + chunk.length, 0);
  chunks.push(padToBlock(size, TAR_RECORD));
  return Buffer.concat(chunks);
}

export function buildSdkContractBundle(
  options: SdkContractBundleOptions
): SdkContractBundleResult {
  const outDir = resolve(options.outDir ?? join(PACKAGE_ROOT, "dist"));
  const stagingDir = join(outDir, STAGING_DIR_NAME);
  const contents = collectBundleContents();

  const operationsManifest = contents.get("schema/sdk-v1.operations.json");
  if (operationsManifest === undefined) {
    throw new Error("Generated artifacts are missing sdk-v1.operations.json");
  }
  const protocolVersion = readProtocolVersion(
    operationsManifest.toString("utf8")
  );

  const files: SdkContractBundleFileEntry[] = sortedPaths(contents).map(
    (path) => {
      const content = contents.get(path);
      if (content === undefined) {
        throw new Error(`Bundle content disappeared for ${path}`);
      }
      return { path, sha256: sha256Hex(content), size: content.length };
    }
  );

  const index: SdkContractBundleIndex = {
    bundle_digest: computeBundleDigest(files),
    bundle_format: BUNDLE_FORMAT,
    commit: options.commit,
    files,
    generated_from: "@nodetool-ai/protocol",
    protocol_version: protocolVersion,
    release: options.release ?? null
  };
  const indexContent = `${JSON.stringify(index, null, 2)}\n`;
  contents.set(BUNDLE_INDEX_FILE, Buffer.from(indexContent, "utf8"));

  rmSync(stagingDir, { force: true, recursive: true });
  for (const path of sortedPaths(contents)) {
    const content = contents.get(path);
    if (content === undefined) {
      continue;
    }
    const target = join(stagingDir, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }

  const tarPrefix = `nodetool-sdk-v1-contract-${protocolVersion}`;
  const tarName = `${tarPrefix}.tar`;
  const tarPath = join(outDir, tarName);
  writeFileSync(tarPath, buildDeterministicTar(contents, tarPrefix));

  return { index, indexContent, stagingDir, tarName, tarPath, tarPrefix };
}

function argValue(argv: readonly string[], flag: string): string | undefined {
  const position = argv.indexOf(flag);
  if (position === -1) {
    return undefined;
  }
  const value = argv[position + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function headCommit(): string {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: PACKAGE_ROOT,
    encoding: "utf8"
  }).trim();
}

function run(): void {
  const argv = process.argv.slice(2);
  const result = buildSdkContractBundle({
    commit: argValue(argv, "--commit") ?? headCommit(),
    outDir: argValue(argv, "--out"),
    release: argValue(argv, "--release") ?? null
  });
  console.log(
    `Staged ${result.index.files.length} files in ${result.stagingDir}`
  );
  console.log(`Bundle digest: ${result.index.bundle_digest}`);
  console.log(`Archive: ${result.tarPath}`);
}

const entryPoint = process.argv[1];
if (entryPoint && pathToFileURL(resolve(entryPoint)).href === import.meta.url) {
  run();
}
