import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CORE_PACKAGES, NODE_PACKS, RUNTIME_LIBRARIES } from "../../../scripts/node-catalog/tiers.mjs";

interface PackageManifest {
  readonly name: string;
  readonly dependencies?: Record<string, string>;
  readonly peerDependencies?: Record<string, string>;
  readonly peerDependenciesMeta?: Record<string, { optional?: boolean }>;
}

function manifest(name: string): PackageManifest {
  return JSON.parse(readFileSync(new URL(`../../${name.split("/")[1]}/package.json`, import.meta.url), "utf8"));
}

const server = manifest("@nodetool-ai/server");
const packs = NODE_PACKS.map((pack: { npmName: string }) => manifest(pack.npmName));

function assertBundledDependencies(dependencies: Readonly<Record<string, string>>): void {
  for (const name of CORE_PACKAGES) {
    const core = manifest(name);
    for (const [peer, metadata] of Object.entries(core.peerDependenciesMeta ?? {})) {
      if (metadata.optional && !dependencies[peer] && !packs.some((pack) => pack.dependencies?.[peer])) {
        throw new Error(`${name} optional peer ${peer} is missing from the bundled host and packs`);
      }
    }
  }
  for (const library of RUNTIME_LIBRARIES) {
    for (const name of library.packages) {
      if (!dependencies[name]) {
        throw new Error(`Bundled runtime library ${name} is missing from @nodetool-ai/server`);
      }
    }
  }
}

describe("bundled host dependency closure", () => {
  it("owns every optional core peer or includes a pack that owns it", () => {
    expect(CORE_PACKAGES.length).toBeGreaterThan(0);
    expect(packs.length).toBeGreaterThan(0);
    assertBundledDependencies(server.dependencies ?? {});
  });

  it("rejects removal of sharp even when a node pack depends on it", () => {
    const { sharp: _sharp, ...dependencies } = server.dependencies ?? {};
    expect(() => assertBundledDependencies(dependencies)).toThrow(/sharp/);
  });
});
