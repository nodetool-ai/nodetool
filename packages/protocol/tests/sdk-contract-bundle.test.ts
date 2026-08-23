import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import {
  BUNDLE_INDEX_FILE,
  buildSdkContractBundle,
  computeBundleDigest,
  type SdkContractBundleResult
} from "../scripts/build-sdk-contract-bundle.js";

const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const RELEASE = "v0.0.0-test";
const FIXTURES_DIR = fileURLToPath(new URL("../fixtures", import.meta.url));
const TAR_BLOCK = 512;

function sha256Hex(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
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
  return files.sort();
}

type TarEntry = {
  readonly content: Buffer;
  readonly gid: string;
  readonly mode: string;
  readonly mtime: string;
  readonly name: string;
  readonly typeflag: string;
  readonly uid: string;
};

function headerField(header: Buffer, offset: number, length: number): string {
  return header.subarray(offset, offset + length).toString("ascii");
}

function parseTar(tar: Buffer): TarEntry[] {
  const entries: TarEntry[] = [];
  let position = 0;
  while (position + TAR_BLOCK <= tar.length) {
    const header = tar.subarray(position, position + TAR_BLOCK);
    if (header.every((byte) => byte === 0)) {
      break;
    }
    const name = headerField(header, 0, 100).replaceAll("\0", "");
    const size = Number.parseInt(headerField(header, 124, 12).trim(), 8);
    const magic = headerField(header, 257, 6);
    expect(magic).toBe("ustar\0");
    let expected = 0;
    for (let index = 0; index < TAR_BLOCK; index += 1) {
      const byte = header[index] ?? 0;
      expected += index >= 148 && index < 156 ? 32 : byte;
    }
    const recorded = Number.parseInt(headerField(header, 148, 8).trim(), 8);
    expect(recorded, `checksum of ${name}`).toBe(expected);
    entries.push({
      content: tar.subarray(
        position + TAR_BLOCK,
        position + TAR_BLOCK + size
      ),
      gid: headerField(header, 116, 8),
      mode: headerField(header, 100, 8),
      mtime: headerField(header, 136, 12),
      name,
      typeflag: headerField(header, 156, 1),
      uid: headerField(header, 108, 8)
    });
    position += TAR_BLOCK + Math.ceil(size / TAR_BLOCK) * TAR_BLOCK;
  }
  return entries;
}

describe("SDK contract bundle builder", () => {
  const tempDirs: string[] = [];
  const build = (): SdkContractBundleResult => {
    const outDir = mkdtempSync(join(tmpdir(), "sdk-contract-bundle-"));
    tempDirs.push(outDir);
    return buildSdkContractBundle({
      commit: COMMIT,
      outDir,
      release: RELEASE
    });
  };
  const first = build();
  const second = build();

  afterAll(() => {
    for (const directory of tempDirs) {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it("is deterministic: two builds produce identical index and tar bytes", () => {
    expect(first.indexContent).toBe(second.indexContent);
    const firstTar = readFileSync(first.tarPath);
    const secondTar = readFileSync(second.tarPath);
    expect(firstTar.equals(secondTar)).toBe(true);
  });

  it("stamps commit, release, and protocol version into the index", () => {
    expect(first.index.commit).toBe(COMMIT);
    expect(first.index.release).toBe(RELEASE);
    expect(first.index.protocol_version).toBe("1");
    expect(first.tarName).toBe("nodetool-sdk-v1-contract-1.tar");
  });

  it("records a correct per-file digest for every staged file", () => {
    const staged = walkFiles(first.stagingDir).map((path) =>
      relative(first.stagingDir, path).split("\\").join("/")
    );
    const indexed = first.index.files.map((file) => file.path);
    expect(staged.sort()).toEqual([...indexed, BUNDLE_INDEX_FILE].sort());
    for (const file of first.index.files) {
      const content = readFileSync(join(first.stagingDir, file.path));
      expect(sha256Hex(content), file.path).toBe(file.sha256);
      expect(content.length, file.path).toBe(file.size);
    }
  });

  it("computes the bundle digest from the sorted per-file digest lines", () => {
    const recomputed = first.index.files
      .map((file) => `${file.sha256}  ${file.path}\n`)
      .sort()
      .join("");
    expect(first.index.bundle_digest).toBe(
      sha256Hex(Buffer.from(recomputed, "utf8"))
    );
    expect(computeBundleDigest(first.index.files)).toBe(
      first.index.bundle_digest
    );
  });

  it("bundles the schema artifacts, execution fixture, and compatibility doc", () => {
    const paths = new Set(first.index.files.map((file) => file.path));
    for (const artifact of [
      "schema/sdk-v1.openapi.json",
      "schema/sdk-v1.openapi.implemented.json",
      "schema/sdk-v1.asyncapi.json",
      "schema/sdk-v1.asyncapi.implemented.json",
      "schema/sdk-v1.discovery.schema.json",
      "schema/sdk-v1.lifecycle.schema.json",
      "schema/sdk-v1.execution.schema.json",
      "schema/sdk-v1.operations.json",
      "schema/sdk-v1.manifest.json",
      "fixtures/sdk-v1/execution-wire.json",
      "docs/protocol-v1-compatibility.md"
    ]) {
      expect(paths.has(artifact), artifact).toBe(true);
    }
  });

  it("bundles every file present under fixtures/ at build time", () => {
    const onDisk = walkFiles(FIXTURES_DIR).map(
      (path) => `fixtures/${relative(FIXTURES_DIR, path).split("\\").join("/")}`
    );
    expect(onDisk.length).toBeGreaterThan(0);
    const paths = new Set(first.index.files.map((file) => file.path));
    for (const fixture of onDisk) {
      expect(paths.has(fixture), fixture).toBe(true);
    }
  });

  it("writes a deterministic USTAR archive with fixed metadata and sorted entries", () => {
    const entries = parseTar(readFileSync(first.tarPath));
    expect(entries.length).toBe(first.index.files.length + 1);
    const names = entries.map((entry) => entry.name);
    expect(names).toEqual([...names].sort());
    const expectedNames = [
      ...first.index.files.map((file) => file.path),
      BUNDLE_INDEX_FILE
    ]
      .sort()
      .map((path) => `${first.tarPrefix}/${path}`);
    expect(names).toEqual(expectedNames);
    for (const entry of entries) {
      expect(entry.mode, entry.name).toBe("0000644\0");
      expect(entry.uid, entry.name).toBe("0000000\0");
      expect(entry.gid, entry.name).toBe("0000000\0");
      expect(entry.mtime, entry.name).toBe("00000000000 ");
      expect(entry.typeflag, entry.name).toBe("0");
    }
    const index = entries.find(
      (entry) => entry.name === `${first.tarPrefix}/${BUNDLE_INDEX_FILE}`
    );
    expect(index?.content.toString("utf8")).toBe(first.indexContent);
  });

  it("archives the same bytes it staged", () => {
    const entries = new Map(
      parseTar(readFileSync(first.tarPath)).map((entry) => [
        entry.name,
        entry.content
      ])
    );
    for (const file of first.index.files) {
      const archived = entries.get(`${first.tarPrefix}/${file.path}`);
      const staged = readFileSync(join(first.stagingDir, file.path));
      expect(archived?.equals(staged), file.path).toBe(true);
    }
  });
});
