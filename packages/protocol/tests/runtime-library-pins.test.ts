import { readFileSync } from "node:fs";
import semver from "semver";
import { describe, expect, it } from "vitest";
import { RUNTIME_NPM_PACKAGES, type RuntimeNpmPackageId } from "../src/runtime-npm-packages.js";

interface Manifest {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  devDependencies?: Record<string, string>;
}

const loaders: ReadonlyArray<readonly [RuntimeNpmPackageId, string, string]> = [
  ["imaging", "sharp", "runtime"], ["imaging", "sharp", "websocket"],
  ["imaging", "@napi-rs/canvas", "timeline"], ["imaging", "@napi-rs/canvas", "agents"],
  ["imaging", "@napi-rs/canvas", "data-nodes"],
  ["typescript", "typescript", "agents"],
  ["tracing", "@opentelemetry/core", "runtime"],
  ["tracing", "@opentelemetry/resources", "runtime"],
  ["tracing", "@opentelemetry/sdk-trace-base", "runtime"],
  ["esbuild", "esbuild", "sandbox-compiler"],
  ["rapier", "@dimforge/rapier3d-compat", "game-runtime"]
];

describe("shared runtime library pins", () => {
  it.each(loaders)("%s pin for %s satisfies the %s loader range", (id, name, loader) => {
    const manifest: Manifest = JSON.parse(readFileSync(new URL(`../../${loader}/package.json`, import.meta.url), "utf8"));
    const peer = manifest.peerDependencies?.[name];
    const declared = peer ?? manifest.dependencies?.[name] ?? manifest.devDependencies?.[name];
    expect(declared).toBeDefined();
    if (peer) {
      expect(manifest.peerDependenciesMeta?.[name]?.optional).toBe(true);
    }
    const spec = RUNTIME_NPM_PACKAGES[id].npmPackages.find((entry) => entry.startsWith(`${name}@`));
    expect(spec).toBeDefined();
    const version = spec?.slice(spec.lastIndexOf("@") + 1) ?? "";
    const range = declared?.startsWith("npm:") ? declared.slice(declared.lastIndexOf("@") + 1) : declared ?? "";
    expect(semver.satisfies(version, range), `${spec} must satisfy ${loader}: ${declared}`).toBe(true);
  });

  it.each(["imaging", "typescript", "tracing", "esbuild", "rapier"] as const)("%s is bundled by desktop and Docker", (id) => {
    expect(RUNTIME_NPM_PACKAGES[id].bundledHosts).toEqual(["desktop", "docker"]);
  });

  it("keeps the TypeScript 6 compiler alias exact", () => {
    expect(RUNTIME_NPM_PACKAGES.typescript.npmPackages).toEqual(["typescript@npm:@typescript/typescript6@6.0.2"]);
  });
});
