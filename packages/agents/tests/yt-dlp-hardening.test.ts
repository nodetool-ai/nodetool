/**
 * The hardened yt-dlp argv, against the real binary.
 *
 * Two findings are reproduced here rather than argued for. yt-dlp reads a
 * *portable* config file — `yt-dlp.conf` in its working directory — and its
 * working directory is the workspace, which guest code writes freely; a guest
 * that plants `--exec` in that file gets arbitrary command execution as the
 * server. And a download with no ceiling fills the disk. Both tests serve
 * bytes from a loopback HTTP server, so nothing here touches the network.
 */
import { spawnSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildYtDlpArgv } from "../src/host-binary-guard.js";
import { runHostBinary } from "../src/host-binaries.js";

const hasYtDlp = spawnSync("yt-dlp", ["--version"]).status === 0;

let server: Server | undefined;
let origin = "";
let workspace = "";

beforeAll(async () => {
  if (!hasYtDlp) return;
  workspace = await mkdtemp(path.join(tmpdir(), "nt-ytdlp-"));
  server = createServer((req, res) => {
    const megabytes = req.url === "/big.mp4" ? 20 : 0;
    const body = Buffer.alloc(megabytes * 1024 * 1024 + 1024, 0);
    res.writeHead(200, {
      "content-type": "video/mp4",
      "content-length": String(body.length)
    });
    res.end(body);
  });
  await new Promise<void>((resolve) => {
    server?.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  origin =
    typeof address === "object" && address
      ? `http://127.0.0.1:${address.port}`
      : "";
});

afterAll(async () => {
  server?.close();
  if (workspace) await rm(workspace, { recursive: true, force: true });
});

describe.skipIf(!hasYtDlp)("the hardened yt-dlp argv", () => {
  it("does not run the --exec a workspace config file asks for", async () => {
    // Exactly what a guest can write with `workspace.write`.
    await writeFile(
      path.join(workspace, "yt-dlp.conf"),
      '--exec "touch owned.txt"\n'
    );
    const result = await runHostBinary(
      "yt-dlp",
      buildYtDlpArgv({ url: `${origin}/small.mp4`, outputFile: "a.%(ext)s" }),
      { cwd: workspace, timeoutMs: 60_000 }
    );
    expect(result.exitCode).toBe(0);
    const written = await readdir(workspace);
    expect(written).not.toContain("owned.txt");
    expect(written).toContain("a.mp4");
  }, 90_000);

  it("aborts a download past the size ceiling before writing it", async () => {
    const result = await runHostBinary(
      "yt-dlp",
      buildYtDlpArgv({
        url: `${origin}/big.mp4`,
        outputFile: "big.%(ext)s",
        maxBytes: 1024 * 1024
      }),
      { cwd: workspace, timeoutMs: 60_000 }
    );
    // `--print` silences the reason, so the property to assert is the one
    // that matters: the bytes never landed.
    expect(await readdir(workspace)).not.toContain("big.mp4");
    expect(result.stdout.trim()).toBe("");
  }, 90_000);
});
