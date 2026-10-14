import { describe, expect, it } from "vitest";
import { assertInstallerModuleIdentity, checkNpmVersion, npmInstallFlags } from "../src/npm-runner.js";

describe("installer npm policy", () => {
  it("forces the install shape and distinguishes global and local persistence", () => {
    const global = npmInstallFlags("global");
    expect(global).toContain("--ignore-scripts");
    expect(global).toContain("--include=optional");
    expect(global).toContain("--legacy-peer-deps=false");
    expect(global).toContain("--force=false");
    expect(global).toContain("--dry-run=false");
    expect(global).toContain("--workspaces=false");
    expect(global).toContain("--no-save");
    const local = npmInstallFlags("local");
    expect(local).not.toContain("--no-save");
    expect(local).toEqual([...global.slice(0, -1), "--save", "--save-exact", "--save-prod"]);
  });

  it("keeps legacy runtime scripts subject to user npm configuration", () => {
    expect(npmInstallFlags("local", "user")).not.toContain("--ignore-scripts");
    expect(npmInstallFlags("local", "user")).not.toContain("--ignore-scripts=false");
    expect(npmInstallFlags("local")).toContain("--ignore-scripts");
    expect(npmInstallFlags("global")).toContain("--ignore-scripts");
  });

  it.each(["9.9.9", "10.8.9", "unknown", "10.9.0-beta.1"])("rejects npm %s", (version) => {
    expect(() => checkNpmVersion(version)).toThrow(/npm install -g npm@11/);
  });
  it.each(["10.9.0", "10.9.8", "11.0.0", "11.16.0"])("accepts npm %s", (version) => {
    expect(checkNpmVersion(version)).toBeNull();
  });
  it("warns on an untested future version", () => {
    expect(checkNpmVersion("12.0.0")).toMatch(/not been tested/);
  });
  it.each(["--preserve-symlinks", "--preserve-symlinks-main", '--preserve-symlinks="true"'])("refuses module identity option %s", (flag) => {
    expect(() => assertInstallerModuleIdentity([flag], "")).toThrow(/Remove/);
    expect(() => assertInstallerModuleIdentity([], `--max-old-space-size=4096 "${flag}"`)).toThrow(/Remove/);
  });
  it("permits unrelated loader flags", () => {
    expect(() => assertInstallerModuleIdentity(["--conditions=nodetool-dev"], "--enable-source-maps")).not.toThrow();
  });
});
