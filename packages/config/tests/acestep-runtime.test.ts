import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";

import {
  ACESTEP_COMMIT,
  ACESTEP_RELEASE_TAG,
  ACESTEP_SHA256,
  AceStepInstallError,
  aceServerPath,
  aceStepAsset,
  aceStepAssetUrl,
  aceStepInstallStatus,
  installAceStep,
  uninstallAceStep
} from "../src/acestep-runtime.js";

/** A minimal zip writer: deflated entries, one central directory. */
function makeZip(files: Record<string, string>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = Buffer.from(name);
    const data = deflateRawSync(Buffer.from(text));
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(text.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(text.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

function serve(body: Buffer): { fetchImpl: typeof fetch; urls: string[] } {
  const urls: string[] = [];
  const fetchImpl = (async (input: Parameters<typeof fetch>[0]) => {
    urls.push(String(input));
    return new Response(new Uint8Array(body));
  }) as typeof fetch;
  return { fetchImpl, urls };
}

const dirs: string[] = [];
async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "acestep-"));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function assetFor(archive: Buffer, sha256: string | null = createHash("sha256").update(archive).digest("hex")) {
  return { name: "ace-server-test.zip", sha256, sizeBytes: archive.length };
}

describe("ace-server pin", () => {
  it("pins a full commit and names the archive and release after it", () => {
    expect(ACESTEP_COMMIT).toMatch(/^[0-9a-f]{40}$/);
    expect(ACESTEP_RELEASE_TAG).toBe(`acestep-${ACESTEP_COMMIT.slice(0, 7)}`);
    const asset = aceStepAsset("darwin", "arm64");
    expect(asset?.name).toBe(`ace-server-${ACESTEP_COMMIT.slice(0, 7)}-macos-arm64.zip`);
    expect(aceStepAssetUrl(asset!)).toBe(
      `https://github.com/nodetool-ai/nodetool/releases/download/${ACESTEP_RELEASE_TAG}/${asset!.name}`
    );
  });

  it("holds either no digest yet or a lowercase SHA-256", () => {
    expect(ACESTEP_SHA256 === null || /^[0-9a-f]{64}$/.test(ACESTEP_SHA256)).toBe(true);
    expect(aceStepAsset("darwin", "arm64")?.sha256).toBe(ACESTEP_SHA256);
  });

  it("ships only for macOS arm64", () => {
    expect(aceStepAsset("darwin", "x64")).toBeNull();
    expect(aceStepAsset("linux", "x64")).toBeNull();
    expect(aceStepAsset("win32", "x64")).toBeNull();
  });

  it("joins the executable to a directory with trailing separators", () => {
    expect(aceServerPath("/opt/ace//")).toBe("/opt/ace/ace-server");
  });
});

describe("installAceStep", () => {
  it("reports an unsupported platform before it downloads anything", async () => {
    const { fetchImpl, urls } = serve(Buffer.alloc(0));
    for (const [platform, arch] of [["linux", "x64"], ["win32", "x64"], ["darwin", "x64"]]) {
      const error = await installAceStep({
        installDir: join(await tempDir(), "acestep"), platform, arch, fetchImpl
      }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AceStepInstallError);
      expect((error as AceStepInstallError).code).toBe("unsupported-platform");
      expect((error as Error).message).toMatch(/Apple silicon/);
    }
    expect(urls).toEqual([]);
  });

  it("refuses to install while the digest is unset, without downloading", async () => {
    const archive = makeZip({ "ace-server": "x" });
    const { fetchImpl, urls } = serve(archive);
    const installDir = join(await tempDir(), "acestep");
    const error = await installAceStep({
      installDir, platform: "darwin", arch: "arm64", asset: assetFor(archive, null), fetchImpl
    }).catch((e: unknown) => e);
    expect((error as AceStepInstallError).code).toBe("digest-unset");
    expect(urls).toEqual([]);
    expect(await aceStepInstallStatus(installDir)).toEqual({ installed: false });
  });

  it("installs an archive whose digest matches, marks it executable and reports it", async () => {
    const root = await tempDir();
    const installDir = join(root, "acestep");
    const archive = makeZip({ "ace-server": "#!/bin/sh\n", "libggml.dylib": "lib" });
    const { fetchImpl, urls } = serve(archive);
    const events: string[] = [];
    const status = await installAceStep({
      installDir, platform: "darwin", arch: "arm64", asset: assetFor(archive), fetchImpl,
      onEvent: (event) => events.push(event.type === "stage" ? event.label : `${event.value}%`)
    });
    expect(status).toEqual({ installed: true, version: ACESTEP_COMMIT });
    expect(urls).toEqual([aceStepAssetUrl(assetFor(archive))]);
    expect(events.at(-1)).toBe("100%");
    expect(await readFile(aceServerPath(installDir), "utf8")).toBe("#!/bin/sh\n");
    expect((await stat(aceServerPath(installDir))).mode & 0o111).not.toBe(0);
    expect(await aceStepInstallStatus(installDir)).toEqual({ installed: true, version: ACESTEP_COMMIT });
    await uninstallAceStep(installDir);
    expect(await aceStepInstallStatus(installDir)).toEqual({ installed: false });
  });

  it("refuses a wrong digest, unpacks nothing and keeps the old install", async () => {
    const root = await tempDir();
    const installDir = join(root, "acestep");
    const good = makeZip({ "ace-server": "old" });
    await installAceStep({
      installDir, platform: "darwin", arch: "arm64", asset: assetFor(good), fetchImpl: serve(good).fetchImpl
    });
    const tampered = makeZip({ "ace-server": "tampered" });
    const error = await installAceStep({
      installDir, platform: "darwin", arch: "arm64", asset: assetFor(good), fetchImpl: serve(tampered).fetchImpl
    }).catch((e: unknown) => e);
    expect((error as AceStepInstallError).code).toBe("digest-mismatch");
    expect((error as Error).message).toMatch(/SHA-256/);
    expect(await readFile(aceServerPath(installDir), "utf8")).toBe("old");
    await expect(stat(`${installDir}.partial`)).rejects.toThrow();
  });

  it("refuses an archive entry that escapes the archive root", async () => {
    const archive = makeZip({ "../escape": "x", "ace-server": "y" });
    await expect(installAceStep({
      installDir: join(await tempDir(), "acestep"), platform: "darwin", arch: "arm64",
      asset: assetFor(archive), fetchImpl: serve(archive).fetchImpl
    })).rejects.toThrow(/outside the archive root/);
  });

  it("reports an HTTP failure", async () => {
    const error = await installAceStep({
      installDir: join(await tempDir(), "acestep"), platform: "darwin", arch: "arm64",
      asset: assetFor(Buffer.from("x")),
      fetchImpl: (async () => new Response("no", { status: 404 })) as typeof fetch
    }).catch((e: unknown) => e);
    expect((error as AceStepInstallError).code).toBe("download-failed");
  });

  it("is not installed when the marker is missing", async () => {
    const installDir = await tempDir();
    await writeFile(aceServerPath(installDir), "x");
    expect(await aceStepInstallStatus(installDir)).toEqual({ installed: false });
  });
});
