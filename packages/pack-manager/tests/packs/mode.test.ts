import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyInstallLayout, detectInstallMode, installDetailsForMode } from "../../src/packs/mode.js";

const directories: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function fixture(): string {
  const directory = mkdtempSync(join(tmpdir(), "nodetool-pack-mode-"));
  directories.push(directory);
  return directory;
}

function cliAt(root: string): string {
  mkdirSync(join(root, "dist"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "@nodetool-ai/cli", version: "1.2.3" }));
  const entry = join(root, "dist", "nodetool.js");
  writeFileSync(entry, "");
  return entry;
}

describe("pack install layout classification", () => {
  it.each([
    ["/opt/node/lib/node_modules/@nodetool-ai/cli", "posix", ["/opt/node/lib/node_modules"], false, false, "global"],
    ["/project/node_modules/@nodetool-ai/cli", "posix", [], true, false, "local"],
    ["/project/node_modules/@nodetool-ai/cli", "posix", [], false, false, "unsupported"],
    ["/cache/_npx/123/node_modules/@nodetool-ai/cli", "posix", [], true, false, "npx"],
    ["/project/node_modules/.pnpm/@nodetool-ai+cli@1.2.3/node_modules/@nodetool-ai/cli", "posix", [], true, false, "unsupported"],
    ["/project/.yarn/cache/cli.zip/node_modules/@nodetool-ai/cli", "posix", [], true, true, "unsupported"],
    ["/home/test/.bun/install/global/node_modules/@nodetool-ai/cli", "posix", [], false, false, "unsupported"],
    ["/checkout/packages/cli", "posix", [], false, false, "dev"],
    [String.raw`C:\Users\test\AppData\Roaming\npm\node_modules\@nodetool-ai\cli`, "win32", [String.raw`C:\Users\test\AppData\Roaming\npm\node_modules`], false, false, "global"],
    [String.raw`C:\project\node_modules\@nodetool-ai\cli`, "win32", [], true, false, "local"],
    [String.raw`C:\cache\_npx\123\node_modules\@nodetool-ai\cli`, "win32", [], true, false, "npx"],
    [String.raw`C:\project\node_modules\.pnpm\cli@1.2.3\node_modules\@nodetool-ai\cli`, "win32", [], true, false, "unsupported"],
    [String.raw`C:\project\.yarn\cache\cli.zip\node_modules\@nodetool-ai\cli`, "win32", [], true, true, "unsupported"],
    [String.raw`C:\Users\test\.bun\install\global\node_modules\@nodetool-ai\cli`, "win32", [], false, false, "unsupported"],
    [String.raw`C:\checkout\packages\cli`, "win32", [], false, false, "dev"]
  ] as const)("classifies %s (%s)", (cliRoot, pathStyle, globalNodeModulesRoots, projectHasCli, yarnPnp, expected) => {
    expect(classifyInstallLayout({ cliRoot, coreVersion: "1.2.3", pathStyle, globalNodeModulesRoots, projectHasCli, yarnPnp }).kind).toBe(expected);
  });

  it("uses exact path segments and Windows path comparison", () => {
    expect(classifyInstallLayout({ cliRoot: "/checkout/_npx_notes/packages/cli", coreVersion: "1.2.3" }).kind).toBe("dev");
    expect(classifyInstallLayout({
      cliRoot: String.raw`C:\NPM\node_modules\@nodetool-ai\cli`, coreVersion: "1.2.3", pathStyle: "win32",
      globalNodeModulesRoots: [String.raw`c:\npm\NODE_MODULES` + "\\"]
    }).kind).toBe("global");
  });

  it("finds the CLI package from the real entry and uses its root for global installs", () => {
    const root = fixture();
    const modules = join(root, "lib", "node_modules");
    const cliRoot = join(modules, "@nodetool-ai", "cli");
    const entry = cliAt(cliRoot);
    const bin = join(root, "bin", "nodetool");
    mkdirSync(dirname(bin));
    symlinkSync(entry, bin);
    expect(detectInstallMode(bin, { globalNodeModulesRoots: [modules] })).toMatchObject({
      kind: "global", cliRoot, coreVersion: "1.2.3", installRoot: cliRoot, nodeModulesRoot: join(cliRoot, "node_modules")
    });
  });

  it.each(["dependencies", "devDependencies", "optionalDependencies"])("admits a listed local CLI in %s", (section) => {
    const root = fixture();
    writeFileSync(join(root, "package.json"), JSON.stringify({ [section]: { "@nodetool-ai/cli": "1.2.3" } }));
    const cliRoot = join(root, "node_modules", "@nodetool-ai", "cli");
    expect(detectInstallMode(cliAt(cliRoot), { globalNodeModulesRoots: [] })).toMatchObject({
      kind: "local", cliRoot, installRoot: root, nodeModulesRoot: join(root, "node_modules")
    });
  });

  it("refuses a local transitive install and detects a real Yarn PnP file", () => {
    const root = fixture();
    writeFileSync(join(root, "package.json"), JSON.stringify({ dependencies: { other: "1.0.0" } }));
    const entry = cliAt(join(root, "node_modules", "@nodetool-ai", "cli"));
    expect(detectInstallMode(entry, { globalNodeModulesRoots: [] }).kind).toBe("unsupported");
    writeFileSync(join(root, ".pnp.cjs"), "");
    expect(detectInstallMode(entry, { globalNodeModulesRoots: [] })).toMatchObject({ kind: "unsupported", reason: expect.stringContaining("Yarn PnP") });
  });

  it("finds workspace packages from their realpath without making them install targets", () => {
    const root = fixture();
    writeFileSync(join(root, "package.json"), JSON.stringify({ workspaces: ["packages/*"] }));
    mkdirSync(join(root, "node_modules"));
    const entry = cliAt(join(root, "packages", "cli"));
    const linkedRoot = join(root, "node_modules", "@nodetool-ai");
    mkdirSync(linkedRoot);
    symlinkSync(join(root, "packages", "cli"), join(linkedRoot, "cli"), "junction");
    expect(detectInstallMode(join(linkedRoot, "cli", "dist", "nodetool.js"))).toMatchObject({
      kind: "dev", cliRoot: join(root, "packages", "cli"), nodeModulesRoot: join(root, "node_modules")
    });
  });

  it("reads a custom user npm prefix without invoking npm or reading unrelated fields", () => {
    const root = fixture();
    const prefix = join(root, "custom-prefix");
    const modules = join(prefix, process.platform === "win32" ? "node_modules" : "lib/node_modules");
    const entry = cliAt(join(modules, "@nodetool-ai", "cli"));
    const userConfig = join(root, "user.npmrc");
    writeFileSync(userConfig, `_authToken=synthetic-unused-token\nprefix=${JSON.stringify(prefix)}\n[unrelated]\nprefix=/wrong-root\n`);
    vi.stubEnv("npm_config_prefix", undefined);
    vi.stubEnv("NPM_CONFIG_PREFIX", undefined);
    vi.stubEnv("npm_config_userconfig", userConfig);
    expect(detectInstallMode(entry)).toMatchObject({ kind: "global", installRoot: join(modules, "@nodetool-ai", "cli") });
  });

  it("respects prefix environment precedence over the configured file", () => {
    const root = fixture();
    const prefix = join(root, "environment-prefix");
    const modules = join(prefix, process.platform === "win32" ? "node_modules" : "lib/node_modules");
    const entry = cliAt(join(modules, "@nodetool-ai", "cli"));
    const userConfig = join(root, "user.npmrc");
    writeFileSync(userConfig, "prefix=/wrong-root\n");
    vi.stubEnv("npm_config_prefix", prefix);
    vi.stubEnv("npm_config_userconfig", userConfig);
    expect(detectInstallMode(entry).kind).toBe("global");
  });

  it("reads the user's default npmrc and expands prefix environment references", () => {
    const root = fixture();
    const prefix = join(root, "home-prefix");
    const modules = join(prefix, process.platform === "win32" ? "node_modules" : "lib/node_modules");
    const entry = cliAt(join(modules, "@nodetool-ai", "cli"));
    writeFileSync(join(root, ".npmrc"), 'prefix=${NODETOOL_TEST_PREFIX} # only this field is used\n');
    vi.stubEnv("HOME", root);
    vi.stubEnv("USERPROFILE", root);
    vi.stubEnv("NODETOOL_TEST_PREFIX", prefix);
    vi.stubEnv("npm_config_prefix", undefined);
    vi.stubEnv("NPM_CONFIG_PREFIX", undefined);
    vi.stubEnv("npm_config_userconfig", undefined);
    vi.stubEnv("NPM_CONFIG_USERCONFIG", undefined);
    expect(detectInstallMode(entry).kind).toBe("global");
  });

  it("canonicalizes a symlinked custom npm prefix", () => {
    const root = fixture();
    const prefix = join(root, "real-prefix");
    const alias = join(root, "prefix-alias");
    const modules = join(prefix, process.platform === "win32" ? "node_modules" : "lib/node_modules");
    const entry = cliAt(join(modules, "@nodetool-ai", "cli"));
    symlinkSync(prefix, alias, "junction");
    const userConfig = join(root, "user.npmrc");
    writeFileSync(userConfig, `prefix=${JSON.stringify(alias)}\n`);
    vi.stubEnv("npm_config_prefix", undefined);
    vi.stubEnv("NPM_CONFIG_PREFIX", undefined);
    vi.stubEnv("npm_config_userconfig", userConfig);
    expect(detectInstallMode(entry)).toMatchObject({ kind: "global", cliRoot: join(modules, "@nodetool-ai", "cli") });
    expect(detectInstallMode(entry, { globalNodeModulesRoots: [join(alias, process.platform === "win32" ? "node_modules" : "lib/node_modules")] }).kind).toBe("global");
  });

  it.each(["global", "local", "npx", "dev", "unsupported"] as const)("describes %s installation support", (kind) => {
    const mode = classifyInstallLayout({
      cliRoot: kind === "npx" ? "/cache/_npx/123/node_modules/@nodetool-ai/cli"
        : kind === "dev" ? "/checkout/packages/cli" : "/prefix/node_modules/@nodetool-ai/cli",
      coreVersion: "1.2.3", globalNodeModulesRoots: kind === "global" ? ["/prefix/node_modules"] : [], projectHasCli: kind === "local"
    });
    const install = installDetailsForMode(mode);
    expect(install.supported).toBe(kind === "global" || kind === "local");
    expect(install.command).toBeNull();
    expect(installDetailsForMode(mode, ["video", "game", "video"]).command).toBe(kind === "global" || kind === "local" ? "nodetool packs add game video --yes" : null);
    if (kind === "npx") {
      expect(install.reason).toBe('Packs need a global or local install. Run "npm install -g @nodetool-ai/cli" or "npm install @nodetool-ai/cli" in a project.');
    }
  });

  it("preserves mode guidance through the actual missing-pack factory", () => {
    const modes = pathToFileURL(join(import.meta.dirname, "../../src/packs/mode.ts")).href;
    const installed = pathToFileURL(join(import.meta.dirname, "../../src/packs/installed.ts")).href;
    const child = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", `
      import assert from 'node:assert/strict';
      import { readCatalogIndex } from '@nodetool-ai/pack-core';
      const { classifyInstallLayout } = await import(${JSON.stringify(modes)});
      const { createMissingPackErrorForMode } = await import(${JSON.stringify(installed)});
      for (const kind of ['global', 'local', 'npx', 'dev', 'unsupported']) {
        const mode = classifyInstallLayout({
          cliRoot: kind === 'npx' ? '/cache/_npx/123/node_modules/@nodetool-ai/cli'
            : kind === 'dev' ? '/checkout/packages/cli' : '/prefix/node_modules/@nodetool-ai/cli',
          coreVersion: readCatalogIndex().coreVersion,
          globalNodeModulesRoots: kind === 'global' ? ['/prefix/node_modules'] : [], projectHasCli: kind === 'local'
        });
        const error = createMissingPackErrorForMode(mode, 'fal');
        const payload = JSON.parse(JSON.stringify(error.details));
        assert.equal(payload.install.supported, kind === 'global' || kind === 'local');
        assert.equal(payload.install.reason, kind === 'global' || kind === 'local' ? null : mode.reason);
        assert.equal(payload.install.command, kind === 'global' || kind === 'local' ? 'nodetool packs add fal --yes' : null);
        assert.ok(!error.message.includes('null'));
      }
    `], { cwd: join(import.meta.dirname, "../../../.."), encoding: "utf8", timeout: 30000 });
    expect(child.status, child.stderr).toBe(0);
  });
});
