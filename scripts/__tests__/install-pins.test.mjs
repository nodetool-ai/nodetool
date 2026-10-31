import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { RUNTIME_NPM_PACKAGES } from "../../packages/protocol/dist/runtime-npm-packages.js";
import { collectReleaseInstallPins, readRegistryInstallMetadata, runtimeInstallTargets } from "../release/install-pins.mjs";

const integrity = value => `sha512-${createHash("sha512").update(value).digest("base64")}`;
const installed = name => ({ name, version: "4.5.6" });
const metadata = (name, version) => ({ name, version, integrity: integrity(`${name}@${version}`) });

describe("release install identities", () => {
  it("keeps fresh-install shared dependency versions equal to the release pins", async () => {
    const agents = JSON.parse(readFileSync(new URL("../../packages/agents/package.json", import.meta.url), "utf8"));
    const lock = JSON.parse(readFileSync(new URL("../../package-lock.json", import.meta.url), "utf8"));
    const pins = await collectReleaseInstallPins({ runtimePackages: RUNTIME_NPM_PACKAGES, readRegistryMetadata: metadata,
      readInstalledManifest: name => ({ name, version: lock.packages[`node_modules/${name}`].version }) });
    const shared = pins.filter(pin => pin.shared);
    expect(shared).toHaveLength(2);
    for (const pin of shared) {
      expect(agents.dependencies[pin.name] ?? agents.peerDependencies[pin.name]).toBe(pin.version);
    }
  });

  it("covers every runtime npm target and both actual shared versions in one flat pin table", async () => {
    const readRegistryMetadata = vi.fn(metadata);
    const runtimeServer = RUNTIME_NPM_PACKAGES["media-codecs"].npmPackages.find(spec => spec.startsWith("@mediabunny/server@"));
    const serverVersion = runtimeServer.slice(runtimeServer.lastIndexOf("@") + 1);
    const pins = await collectReleaseInstallPins({ runtimePackages: RUNTIME_NPM_PACKAGES, readRegistryMetadata,
      readInstalledManifest: name => name === "@mediabunny/server" ? { name, version: serverVersion } : installed(name) });
    const targets = runtimeInstallTargets(RUNTIME_NPM_PACKAGES);
    expect(targets.length).toBeGreaterThan(0);
    expect(pins.map(pin => [pin.installName ?? pin.name, pin.name, pin.version])).toEqual([
      ...targets.map(pin => [pin.installName ?? pin.name, pin.name, pin.version]),
      ["mediabunny", "mediabunny", "4.5.6"]
    ]);
    expect(new Set(pins.map(pin => pin.installName ?? pin.name)).size).toBe(pins.length);
    expect(pins.find(pin => pin.installName === "typescript")).toEqual({ name: "@typescript/typescript6", installName: "typescript", version: "6.0.2", integrity: integrity("@typescript/typescript6@6.0.2") });
    expect(pins.filter(pin => pin.shared).map(pin => pin.name).sort()).toEqual(["@mediabunny/server", "mediabunny"]);
    expect(readRegistryMetadata.mock.calls).toEqual(pins.map(pin => [pin.name, pin.version]));
  });

  it("queries only the exact registry identity at the official npm registry", () => {
    const run = vi.fn(() => JSON.stringify({ name: "@typescript/typescript6", version: "6.0.2", "dist.integrity": integrity("compiler") }));
    expect(readRegistryInstallMetadata("@typescript/typescript6", "6.0.2", run)).toEqual({ name: "@typescript/typescript6", version: "6.0.2", integrity: integrity("compiler") });
    expect(run).toHaveBeenCalledWith("npm", ["view", "@typescript/typescript6@6.0.2", "name", "version", "dist.integrity", "--json", "--registry=https://registry.npmjs.org"], {});
  });

  it.each(["typescript@^6.0.2", "typescript@latest", "typescript@npm:../escape@1.2.3", "typescript@file:/tmp/compiler", "typescript@6.0.2-01"])("refuses nonexact or invalid runtime spec %s before registry IO", async spec => {
    const readRegistryMetadata = vi.fn(metadata);
    await expect(collectReleaseInstallPins({ runtimePackages: { fixture: { npmPackages: [spec], packageNames: ["typescript"] } }, readRegistryMetadata, readInstalledManifest: installed })).rejects.toThrow(/Invalid/);
    expect(readRegistryMetadata).not.toHaveBeenCalled();
  });

  it.each([
    { name: "other", version: "1.2.3", integrity: integrity("other") },
    { name: "fixture", version: "1.2.4", integrity: integrity("fixture") },
    { name: "fixture", version: "1.2.3", integrity: "sha512-corrupt" }
  ])("rejects wrong registry metadata %j", async result => {
    await expect(collectReleaseInstallPins({ runtimePackages: { fixture: { npmPackages: ["fixture@1.2.3"], packageNames: ["fixture"] } }, readRegistryMetadata: () => result, readInstalledManifest: installed })).rejects.toThrow(/Registry identity|Invalid sha512/);
  });

  it("rejects inconsistent aliases and shared manifests before registry IO", async () => {
    expect(() => runtimeInstallTargets({ fixture: { npmPackages: ["other@1.2.3"], packageNames: ["fixture"] } })).toThrow("Invalid runtime");
    expect(() => runtimeInstallTargets({})).toThrow("inspected no npm targets");
    const readRegistryMetadata = vi.fn(metadata);
    await expect(collectReleaseInstallPins({ runtimePackages: { fixture: { npmPackages: ["fixture@1.2.3"], packageNames: ["fixture"] } }, readRegistryMetadata, readInstalledManifest: () => ({ name: "other", version: "4.5.6" }) })).rejects.toThrow("Shared release package identity");
    expect(readRegistryMetadata).not.toHaveBeenCalled();
  });
});
