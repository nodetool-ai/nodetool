import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { providerStates } from "../src/lean/providerStatus.js";

const directories: string[] = [];
function fixture(): string {
  const directory = mkdtempSync(join(tmpdir(), "nodetool-sdcpp-status-"));
  directories.push(directory);
  return directory;
}
function state(env: NodeJS.ProcessEnv) {
  return providerStates({ env, storedKeys: new Set(), installedPacks: new Set() })
    .find(provider => provider.id === "stable_diffusion_cpp");
}
function binary(directory: string, executable = true): string {
  const file = join(directory, process.platform === "win32" ? "sd-server.exe" : "sd-server");
  writeFileSync(file, "fixture", { mode: executable ? 0o755 : 0o644 });
  return file;
}
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("stable-diffusion.cpp CLI discovery", () => {
  it("lists the provider and its runtime installation command before installation", () => {
    expect(state({ HOME: fixture(), PATH: "" })).toMatchObject({
      id: "stable_diffusion_cpp", usable: false, source: null,
      requires: expect.stringContaining("nodetool runtime add sd-cpp")
    });
  });
  it("recognizes an executable override without an API key or node pack", () => {
    expect(state({ HOME: fixture(), PATH: "", SD_CPP_SERVER_PATH: binary(fixture()) }))
      .toMatchObject({ usable: true, source: "runtime" });
  });
  it("recognizes sd-server on PATH", () => {
    const directory = fixture();
    binary(directory);
    expect(state({ HOME: fixture(), PATH: directory })).toMatchObject({ usable: true, source: "runtime" });
  });
  it("recognizes the managed CLI runtime", () => {
    const home = fixture();
    const directory = join(home, "data", "nodetool", "sd-cpp");
    mkdirSync(directory, { recursive: true });
    binary(directory);
    expect(state({ HOME: home, PATH: "", XDG_DATA_HOME: join(home, "data"), APPDATA: join(home, "data") }))
      .toMatchObject({ usable: true, source: "runtime" });
  });
  it("does not treat a missing override as an installed runtime", () => {
    expect(state({ HOME: fixture(), PATH: "", SD_CPP_SERVER_PATH: join(fixture(), "missing") }))
      .toMatchObject({ usable: false, source: null });
  });
  it.skipIf(process.platform === "win32")("rejects non-executable files", () => {
    expect(state({ HOME: fixture(), PATH: "", SD_CPP_SERVER_PATH: binary(fixture(), false) }))
      .toMatchObject({ usable: false, source: null });
  });
});

describe("ACE-Step CLI discovery", () => {
  const aceState = (env: NodeJS.ProcessEnv) =>
    providerStates({ env, storedKeys: new Set(), installedPacks: new Set() }).find(provider => provider.id === "acestep");
  const aceBinary = (directory: string, executable = true): string => {
    const file = join(directory, process.platform === "win32" ? "ace-server.exe" : "ace-server");
    writeFileSync(file, "fixture", { mode: executable ? 0o755 : 0o644 });
    return file;
  };

  it("lists the provider and its install command before installation", () => {
    expect(aceState({ HOME: fixture(), PATH: "" })).toMatchObject({
      usable: false, source: null, requires: expect.stringContaining("nodetool runtime add acestep")
    });
  });
  it("recognizes an executable override, the managed runtime and a remote URL", () => {
    expect(aceState({ HOME: fixture(), PATH: "", ACESTEP_SERVER_PATH: aceBinary(fixture()) })).toMatchObject({ usable: true });
    const home = fixture();
    const directory = join(home, "data", "nodetool", "acestep");
    mkdirSync(directory, { recursive: true });
    aceBinary(directory);
    expect(aceState({ HOME: home, PATH: "", XDG_DATA_HOME: join(home, "data"), APPDATA: join(home, "data") })).toMatchObject({ usable: true });
    expect(aceState({ HOME: fixture(), PATH: "", ACESTEP_SERVER_URL: "http://10.0.0.2:8085" })).toMatchObject({ usable: true });
  });
  it.skipIf(process.platform === "win32")("rejects a non-executable file", () => {
    expect(aceState({ HOME: fixture(), PATH: "", ACESTEP_SERVER_PATH: aceBinary(fixture(), false) })).toMatchObject({ usable: false });
  });
});
