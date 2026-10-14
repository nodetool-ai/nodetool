import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("release tarball reuse", () => {
  it.skipIf(process.platform === "win32")("packs each public workspace once and publishes those same files", () => {
    const root = mkdtempSync(join(tmpdir(), "nodetool-publish-test-"));
    try {
      const npm = join(root, "npm");
      const log = join(root, "npm-calls.ndjson");
      writeFileSync(npm, `#!${process.execPath}
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const args = process.argv.slice(2);
appendFileSync(process.env.PUBLISH_TEST_LOG, JSON.stringify({ args, cwd: process.cwd() }) + "\\n");
if (args[0] === "pack") {
  const manifest = JSON.parse(readFileSync("package.json", "utf8"));
  const staging = mkdtempSync(join(tmpdir(), "nodetool-fake-pack-"));
  mkdirSync(join(staging, "package"));
  writeFileSync(join(staging, "package", "package.json"), JSON.stringify(manifest));
  const filename = manifest.name.replaceAll("/", "-").replace("@", "") + ".tgz";
  const dest = args[args.indexOf("--pack-destination") + 1];
  const packed = spawnSync("tar", ["-czf", join(dest, filename), "-C", staging, "package"]);
  rmSync(staging, { recursive: true, force: true });
  if (packed.status !== 0) { process.exit(1); }
  console.log(JSON.stringify([{ filename }]));
} else if (args[0] === "publish") {
  if (!args.includes("--dry-run") || !existsSync(args[1]) || !args[1].endsWith(".tgz")) { process.exit(1); }
} else { process.exit(1); }
`);
      writeFileSync(join(root, "package.json"), '{"type":"module"}');
      chmodSync(npm, 0o755);
      const env = { ...process.env, PATH: `${root}:${process.env.PATH}`, PUBLISH_TEST_LOG: log };
      const script = resolve(import.meta.dirname, "..", "publish-packages.mjs");
      const artifacts = join(root, "artifacts");
      const run = (args) => spawnSync(process.execPath, [script, ...args], { env, encoding: "utf8" });
      const packed = run(["--pack-only", "--tarballs-dir", artifacts]);
      expect(packed.status, packed.stderr).toBe(0);
      const published = run(["--dry-run", "--tarballs-dir", artifacts]);
      expect(published.status, published.stderr).toBe(0);
      const calls = readFileSync(log, "utf8").trim().split("\n").map((line) => JSON.parse(line));
      const packs = calls.filter((call) => call.args[0] === "pack");
      const publishes = calls.filter((call) => call.args[0] === "publish");
      expect(packs.length).toBeGreaterThan(0);
      expect(new Set(packs.map((call) => call.cwd)).size).toBe(packs.length);
      expect(publishes.length).toBe(packs.length);
      expect(publishes.every((call) => dirname(call.args[1]) === artifacts)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 120_000);
});
