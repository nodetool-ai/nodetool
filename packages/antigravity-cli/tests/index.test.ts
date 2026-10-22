import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAntigravityBinaryPath,
  getAntigravityPlatform,
  installAntigravity,
  resolveAntigravityCommand
} from "../src/index.js";

let root: string;
let body: Buffer;
const releaseUrl =
  "https://storage.googleapis.com/antigravity-public/antigravity-cli/test/cli";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "nodetool-agy-test-"));
  vi.stubEnv("XDG_DATA_HOME", root);
  body = Buffer.from("#!/bin/sh\nprintf 'managed-agy\\n'\n");
});
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

function mockDownload(
  url = releaseUrl,
  checksum = createHash("sha512").update(body).digest("hex")
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: string) => {
    if (input.includes("/manifests/")) {
      return Response.json({ version: "test", url, sha512: checksum });
    }
    return new Response(new Uint8Array(body));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe.skipIf(process.platform === "win32")("managed installation", () => {
  it("installs verified bytes and resolves an executable without PATH changes", async () => {
    expect(await resolveAntigravityCommand()).toBe("agy");
    const fetchMock = mockDownload();
    const binary = await installAntigravity();
    expect(binary).toBe(join(root, "nodetool", "bin", "antigravity", "agy"));
    expect(await readFile(binary)).toEqual(body);
    expect(execFileSync(binary, { encoding: "utf8" })).toBe("managed-agy\n");
    expect(await resolveAntigravityCommand()).toBe(binary);
    expect(await installAntigravity()).toBe(binary);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await readdir(join(root, "nodetool", "bin", "antigravity"))).toEqual(
      ["agy"]
    );
  });

  it("extracts only the binary from an archive", async () => {
    await writeFile(join(root, "antigravity"), body);
    await writeFile(join(root, "unrelated"), "do not install");
    execFileSync("tar", [
      "-czf",
      join(root, "release.tar.gz"),
      "-C",
      root,
      "antigravity",
      "unrelated"
    ]);
    const expected = body;
    body = await readFile(join(root, "release.tar.gz"));
    mockDownload(`${releaseUrl}.tar.gz`);
    const binary = await installAntigravity();
    expect(await readFile(binary)).toEqual(expected);
    expect(await readdir(join(root, "nodetool", "bin", "antigravity"))).toEqual(
      ["agy"]
    );
  });

  it("rejects checksum mismatches and removes staging files", async () => {
    mockDownload(releaseUrl, "0".repeat(128));
    await expect(installAntigravity()).rejects.toThrow("checksum mismatch");
    expect(await resolveAntigravityCommand()).toBe("agy");
    expect(await readdir(join(root, "nodetool", "bin", "antigravity"))).toEqual(
      []
    );
  });

  it("rejects manifest URLs outside the official release bucket before downloading", async () => {
    const fetchMock = mockDownload("https://example.com/agy");
    await expect(installAntigravity()).rejects.toThrow(
      "official Antigravity release URL"
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects failed downloads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("unavailable", { status: 503 }))
    );
    await expect(installAntigravity()).rejects.toThrow("HTTP 503");
    await expect(readFile(getAntigravityBinaryPath())).rejects.toThrow();
  });

  it("honors cancellation before fetching", async () => {
    const fetchMock = mockDownload();
    await expect(
      installAntigravity({ signal: AbortSignal.abort() })
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows concurrent installations to publish one complete binary", async () => {
    mockDownload();
    const paths = await Promise.all([
      installAntigravity(),
      installAntigravity()
    ]);
    expect(paths[0]).toBe(paths[1]);
    expect(await readFile(paths[0])).toEqual(body);
    expect(await readdir(join(root, "nodetool", "bin", "antigravity"))).toEqual(
      ["agy"]
    );
  });

  it("rejects archives missing the binary", async () => {
    await writeFile(join(root, "unrelated"), "no binary");
    execFileSync("tar", [
      "-czf",
      join(root, "release.tar.gz"),
      "-C",
      root,
      "unrelated"
    ]);
    body = await readFile(join(root, "release.tar.gz"));
    mockDownload(`${releaseUrl}.tar.gz`);
    await expect(installAntigravity()).rejects.toThrow("extraction failed");
    expect(await resolveAntigravityCommand()).toBe("agy");
  });
});

it.each([
  ["darwin", "arm64", false, "darwin_arm64"],
  ["darwin", "x64", false, "darwin_amd64"],
  ["linux", "arm64", true, "linux_arm64_musl"],
  ["linux", "x64", false, "linux_amd64"],
  ["android", "arm64", false, "android_arm64"]
])("maps %s/%s musl=%s", (platform, arch, musl, expected) => {
  expect(getAntigravityPlatform(platform, arch, musl)).toBe(expected);
});
it("rejects unsupported platforms", () => {
  expect(() => getAntigravityPlatform("win32", "x64")).toThrow("Unsupported");
  expect(() => getAntigravityPlatform("linux", "ia32")).toThrow("Unsupported");
});
