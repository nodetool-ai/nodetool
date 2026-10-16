import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";

import {
  SD_CPP_RELEASE_TAG,
  installSdCpp,
  readZipEntries,
  sdCppAsset,
  sdCppInstallStatus,
  sdServerPath,
  uninstallSdCpp
} from "../src/sd-cpp-runtime.js";

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

function serve(body: Buffer): typeof fetch {
  return (async () => new Response(new Uint8Array(body))) as typeof fetch;
}

const dirs: string[] = [];
async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "sdcpp-"));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("sd-server release", () => {
  it("pins one archive per supported platform", () => {
    expect(sdCppAsset("darwin", "arm64")?.name).toContain("Darwin");
    expect(sdCppAsset("darwin", "x64")?.name).toContain("Darwin");
    expect(sdCppAsset("linux", "x64")?.name).toContain("vulkan");
    expect(sdCppAsset("win32", "x64")?.name).toContain("win-vulkan");
    expect(sdCppAsset("linux", "arm64")).toBeNull();
  });

  it("reads deflated zip entries", () => {
    const entries = readZipEntries(makeZip({ "a.txt": "alpha", "b/c.txt": "gamma" }), { inflateRawSync });
    expect(entries.map((e) => [e.name, Buffer.from(e.data).toString()])).toEqual([
      ["a.txt", "alpha"],
      ["b/c.txt", "gamma"]
    ]);
  });

  it("installs, reports and removes sd-server", async () => {
    const root = await tempDir();
    const installDir = join(root, "sd-cpp");
    const archive = makeZip({ "sd-server": "#!/bin/sh\n", "libstable-diffusion.dylib": "lib" });
    const asset = {
      name: "test.zip",
      sha256: createHash("sha256").update(archive).digest("hex"),
      sizeBytes: archive.length
    };
    const status = await installSdCpp({
      installDir, platform: "darwin", arch: "arm64", asset, fetchImpl: serve(archive)
    });
    expect(status).toEqual({ installed: true, version: SD_CPP_RELEASE_TAG });
    expect(await readFile(sdServerPath(installDir, "darwin"), "utf8")).toBe("#!/bin/sh\n");
    expect((await stat(sdServerPath(installDir, "darwin"))).mode & 0o111).not.toBe(0);
    expect(await sdCppInstallStatus(installDir, "darwin")).toEqual({ installed: true, version: SD_CPP_RELEASE_TAG });
    await uninstallSdCpp(installDir);
    expect(await sdCppInstallStatus(installDir, "darwin")).toEqual({ installed: false });
  });

  it("refuses an archive whose digest does not match and keeps the old install", async () => {
    const root = await tempDir();
    const installDir = join(root, "sd-cpp");
    const good = makeZip({ "sd-server": "old" });
    const sha256 = createHash("sha256").update(good).digest("hex");
    await installSdCpp({
      installDir, platform: "linux", arch: "x64",
      asset: { name: "good.zip", sha256, sizeBytes: good.length }, fetchImpl: serve(good)
    });
    await expect(installSdCpp({
      installDir, platform: "linux", arch: "x64",
      asset: { name: "bad.zip", sha256, sizeBytes: good.length },
      fetchImpl: serve(makeZip({ "sd-server": "tampered" }))
    })).rejects.toThrow(/SHA-256/);
    expect(await readFile(sdServerPath(installDir, "linux"), "utf8")).toBe("old");
  });

  it("refuses an entry that escapes the archive root", async () => {
    const root = await tempDir();
    const archive = makeZip({ "../escape": "x", "sd-server": "y" });
    await expect(installSdCpp({
      installDir: join(root, "sd-cpp"), platform: "linux", arch: "x64",
      asset: { name: "evil.zip", sha256: createHash("sha256").update(archive).digest("hex"), sizeBytes: archive.length },
      fetchImpl: serve(archive)
    })).rejects.toThrow(/outside the archive root/);
  });
});
