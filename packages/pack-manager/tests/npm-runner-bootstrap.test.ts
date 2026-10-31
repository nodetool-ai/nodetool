import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, it, vi } from "vitest";
import { findNpmCli, runInstallerNpm, runNpm } from "../src/npm-runner.js";

const exec = promisify(execFile);
it("real npm bootstrap preserves target-relative configuration, INIT_CWD, and target manifests", async () => {
  const base = await mkdtemp(join(tmpdir(), "npm-prefix-"));
  try {
    vi.stubEnv("npm_config_cache", undefined); vi.stubEnv("NPM_CONFIG_CACHE", undefined);
    const cli = findNpmCli(); if (!cli) { throw new Error("Fixture requires npm-cli.js"); }
    const npm = (args: string[], cwd = base) => exec(process.execPath, [cli, ...args], { cwd });
    const source = join(base, "source"); await mkdir(source);
    await writeFile(join(source, "package.json"), '{"name":"prefix-fixture-package","version":"1.0.0"}');
    const packed = JSON.parse((await npm(["pack", "--json", "--ignore-scripts", `--cache=${join(base, "pack-cache")}`], source)).stdout);
    const tarball = join(source, packed[0].filename);
    const root = join(base, ...Array.from({ length: 7 }, (_, i) => `long-${i}-${"x".repeat(35)}`));
    expect(root.length).toBeGreaterThan(260); await mkdir(root, { recursive: true });
    const baseline = '{"name":"short-parent","version":"1.0.0"}';
    await writeFile(join(base, "package.json"), baseline);
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "long-project", version: "1.0.0",
      scripts: { record: "node -e \"require('fs').writeFileSync('init-cwd.txt', process.env.INIT_CWD)\"" } }));
    await writeFile(join(root, ".npmrc"), "registry=https://target-project.invalid/\ncafile=./cert.pem\ncache=./npm-cache\n");
    await writeFile(join(root, "cert.pem"), "fixture certificate");
    const priorCafile = (await npm(["config", "get", "cafile", `--prefix=${root}`])).stdout.trim();
    expect(priorCafile).not.toBe(join(root, "cert.pem"));
    const cafile = await runInstallerNpm(root, ["config", "get", "cafile"], { mode: "local" });
    const cache = await runInstallerNpm(root, ["config", "get", "cache"], { mode: "local" });
    expect(cafile.trim()).toBe(join(root, "cert.pem"));
    expect(cache.trim()).toBe(join(root, "npm-cache"));
    await runInstallerNpm(root, ["install", tarball], { mode: "local" });
    await runNpm(root, ["run", "record"], { mode: "local", scriptPolicy: "user" });
    expect(await readFile(join(root, "init-cwd.txt"), "utf8")).toBe(root);
    expect(JSON.parse(await readFile(join(root, "package.json"), "utf8")).dependencies["prefix-fixture-package"]).toBeDefined();
    expect(JSON.parse(await readFile(join(root, "package-lock.json"), "utf8")).packages["node_modules/prefix-fixture-package"].version).toBe("1.0.0");
    expect(await readFile(join(base, "package.json"), "utf8")).toBe(baseline);
    await expect(readFile(join(base, "package-lock.json"))).rejects.toMatchObject({ code: "ENOENT" });
  } finally { vi.unstubAllEnvs(); await rm(base, { recursive: true, force: true }); }
}, 30000);
