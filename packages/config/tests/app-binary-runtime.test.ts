import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, readlink, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";

import {
  appBinaryInstallStatus,
  appBinaryPath,
  digestFor,
  installAppBinary,
  installedAppBinary,
  newestBlenderArchive,
  uninstallAppBinary
} from "../src/app-binary-runtime.js";

interface ZipFile {
  data: string;
  /** Unix mode, including the file type bits. */
  mode: number;
}

/** A zip "made on Unix" whose external attributes carry each mode. */
function makeUnixZip(files: Record<string, ZipFile>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, file] of Object.entries(files)) {
    const nameBytes = Buffer.from(name);
    const data = deflateRawSync(Buffer.from(file.data));
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt8(3, 5);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(((file.mode << 16) >>> 0), 38);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(centrals.length / 2, 8);
  end.writeUInt16LE(centrals.length / 2, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

/** A fetch that answers from a table of URL to body, and 404 otherwise. */
function fakeFetch(routes: Record<string, string | Buffer>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    const body = routes[url];
    if (body === undefined) return new Response("missing", { status: 404 });
    return new Response(typeof body === "string" ? body : new Uint8Array(body), {
      headers: { "content-length": String(Buffer.byteLength(body)) }
    });
  }) as typeof fetch;
}

const CHROME_JSON = "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json";
const CHROME_ZIP = "https://storage.googleapis.com/chrome-for-testing-public/140.0.1/linux64/chrome-linux64.zip";
const BLENDER_DIR = "https://download.blender.org/release/Blender5.2/";

let dir: string | null = null;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = null;
});

describe("Blender release lookup", () => {
  it("picks the newest patch of the series for the platform", () => {
    const listing = `
      <a href="blender-5.2.0-linux-x64.tar.xz">blender-5.2.0-linux-x64.tar.xz</a>
      <a href="blender-5.2.10-linux-x64.tar.xz">blender-5.2.10-linux-x64.tar.xz</a>
      <a href="blender-5.2.9-linux-x64.tar.xz">blender-5.2.9-linux-x64.tar.xz</a>
      <a href="blender-5.2.11-windows-x64.zip">blender-5.2.11-windows-x64.zip</a>`;
    expect(newestBlenderArchive(listing, "linux-x64.tar.xz")).toEqual({
      fileName: "blender-5.2.10-linux-x64.tar.xz",
      version: "5.2.10"
    });
    expect(newestBlenderArchive(listing, "macos-arm64.dmg")).toBeNull();
  });

  it("reads the digest for one file out of a sha256 list", () => {
    const sums = `${"a".repeat(64)}  blender-5.2.1-linux-x64.tar.xz\n${"B".repeat(64)}  blender-5.2.1-windows-x64.zip\n`;
    expect(digestFor(sums, "blender-5.2.1-windows-x64.zip")).toBe("b".repeat(64));
    expect(digestFor(sums, "blender-5.2.1-macos-x64.dmg")).toBeNull();
  });
});

describe("appBinaryPath", () => {
  it("names each executable inside its install directory", () => {
    expect(appBinaryPath("blender", "/d", "linux")).toBe("/d/blender");
    expect(appBinaryPath("blender", "/d", "darwin")).toBe("/d/Blender.app/Contents/MacOS/Blender");
    expect(appBinaryPath("chrome", "C:\\d", "win32")).toBe("C:\\d\\chrome.exe");
    expect(appBinaryPath("chrome", "/d", "darwin")).toBe(
      "/d/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
    );
  });
});

describe.skipIf(process.platform === "win32")("installAppBinary", () => {
  it("unpacks Chrome for Testing with its modes and links, and uninstalls it", async () => {
    dir = await mkdtemp(join(tmpdir(), "nodetool-chrome-"));
    const installDir = join(dir, "chrome");
    const zip = makeUnixZip({
      "chrome-linux64/": { data: "", mode: 0o040755 },
      "chrome-linux64/chrome": { data: "#!/bin/sh\n", mode: 0o100755 },
      "chrome-linux64/resources.pak": { data: "pak", mode: 0o100644 },
      "chrome-linux64/libalias.so": { data: "resources.pak", mode: 0o120777 }
    });
    const fetchImpl = fakeFetch({
      [CHROME_JSON]: JSON.stringify({
        channels: {
          Stable: {
            version: "140.0.1",
            downloads: { chrome: [{ platform: "linux64", url: CHROME_ZIP }] }
          }
        }
      }),
      [CHROME_ZIP]: zip
    });

    const status = await installAppBinary("chrome", { installDir, platform: "linux", arch: "x64", fetchImpl });

    expect(status).toEqual({ installed: true, version: "140.0.1" });
    expect((await stat(join(installDir, "chrome"))).mode & 0o777).toBe(0o755);
    expect((await stat(join(installDir, "resources.pak"))).mode & 0o777).toBe(0o644);
    expect((await lstat(join(installDir, "libalias.so"))).isSymbolicLink()).toBe(true);
    expect(await readlink(join(installDir, "libalias.so"))).toBe("resources.pak");
    expect(await appBinaryInstallStatus("chrome", installDir, "linux")).toEqual({
      installed: true,
      version: "140.0.1"
    });
    expect(await installedAppBinary("chrome", installDir, "linux")).toBe(join(installDir, "chrome"));
    await expect(stat(`${installDir}.partial`)).rejects.toThrow();
    await expect(stat(`${installDir}.download`)).rejects.toThrow();

    await uninstallAppBinary(installDir);
    expect(await installedAppBinary("chrome", installDir, "linux")).toBeNull();
  });

  it("refuses a link that points outside the archive", async () => {
    dir = await mkdtemp(join(tmpdir(), "nodetool-chrome-"));
    const installDir = join(dir, "chrome");
    const fetchImpl = fakeFetch({
      [CHROME_JSON]: JSON.stringify({
        channels: { Stable: { version: "1", downloads: { chrome: [{ platform: "linux64", url: CHROME_ZIP }] } } }
      }),
      [CHROME_ZIP]: makeUnixZip({
        "chrome-linux64/chrome": { data: "#!/bin/sh\n", mode: 0o100755 },
        "chrome-linux64/escape": { data: "../../../etc/passwd", mode: 0o120777 }
      })
    });
    await expect(
      installAppBinary("chrome", { installDir, platform: "linux", arch: "x64", fetchImpl })
    ).rejects.toThrow(/link outside its root/);
    expect(await installedAppBinary("chrome", installDir, "linux")).toBeNull();
  });

  it("installs the newest Blender after checking its published digest", async () => {
    dir = await mkdtemp(join(tmpdir(), "nodetool-blender-"));
    const source = join(dir, "src", "blender-5.2.4-linux-x64");
    await mkdir(source, { recursive: true });
    await writeFile(join(source, "blender"), "#!/bin/sh\n", { mode: 0o755 });
    const archive = join(dir, "blender.tar.xz");
    execFileSync("tar", ["-cJf", archive, "-C", join(dir, "src"), "blender-5.2.4-linux-x64"]);
    const bytes = await readFile(archive);
    const digest = createHash("sha256").update(bytes).digest("hex");
    const installDir = join(dir, "blender");
    const routes = {
      [BLENDER_DIR]: '<a href="blender-5.2.3-linux-x64.tar.xz"></a><a href="blender-5.2.4-linux-x64.tar.xz"></a>',
      [`${BLENDER_DIR}blender-5.2.4.sha256`]: `${digest}  blender-5.2.4-linux-x64.tar.xz\n`,
      [`${BLENDER_DIR}blender-5.2.4-linux-x64.tar.xz`]: bytes
    };

    const status = await installAppBinary("blender", {
      installDir, platform: "linux", arch: "x64", fetchImpl: fakeFetch(routes)
    });
    expect(status).toEqual({ installed: true, version: "5.2.4" });
    expect(await installedAppBinary("blender", installDir, "linux")).toBe(join(installDir, "blender"));
  });

  it("rejects a Blender archive whose digest does not match and keeps the old install", async () => {
    dir = await mkdtemp(join(tmpdir(), "nodetool-blender-"));
    const installDir = join(dir, "blender");
    await mkdir(installDir, { recursive: true });
    await writeFile(join(installDir, "blender"), "old", { mode: 0o755 });
    const routes = {
      [BLENDER_DIR]: '<a href="blender-5.2.4-linux-x64.tar.xz"></a>',
      [`${BLENDER_DIR}blender-5.2.4.sha256`]: `${"0".repeat(64)}  blender-5.2.4-linux-x64.tar.xz\n`,
      [`${BLENDER_DIR}blender-5.2.4-linux-x64.tar.xz`]: Buffer.from("tampered")
    };
    await expect(
      installAppBinary("blender", { installDir, platform: "linux", arch: "x64", fetchImpl: fakeFetch(routes) })
    ).rejects.toThrow(/SHA-256/);
    expect(await readFile(join(installDir, "blender"), "utf8")).toBe("old");
  });
});
