/**
 * Workspace dependency pinning for `node scripts/prepare-publish.mjs`.
 *
 * A caret range let `@nodetool-ai/cli@0.8.1` resolve to a half-published
 * 0.8.2 sibling, so an old release broke when a new one failed. Exact pins
 * keep each published version tied to the set it was built with.
 */
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { resolveWorkspaceDeps, resolveMcpServerVersion } from "../prepare-publish.mjs";

describe("resolveWorkspaceDeps", () => {
  const versions = new Map([
    ["@nodetool-ai/agents", "0.8.2"],
    ["@nodetool-ai/protocol", "0.8.2"]
  ]);

  it("pins workspace dependencies to the exact version", () => {
    const pkg = {
      dependencies: { "@nodetool-ai/agents": "*", chalk: "^5.3.0" },
      peerDependencies: { "@nodetool-ai/protocol": "*" }
    };
    resolveWorkspaceDeps(pkg, versions);
    expect(pkg.dependencies).toEqual({
      "@nodetool-ai/agents": "0.8.2",
      chalk: "^5.3.0"
    });
    expect(pkg.peerDependencies).toEqual({ "@nodetool-ai/protocol": "0.8.2" });
  });

  it("leaves non-workspace and unknown dependencies alone", () => {
    const pkg = { dependencies: { "@nodetool-ai/unknown": "*", ws: "*" } };
    expect(resolveWorkspaceDeps(pkg, versions)).toEqual([]);
    expect(pkg.dependencies).toEqual({ "@nodetool-ai/unknown": "*", ws: "*" });
  });
});


describe("MCP release sidecar", () => {
  it("refuses a registry identity or npm package mismatch", () => {
    const pkg = { name: "@nodetool-ai/cli-mcp", version: "1.2.3-next.4", mcpName: "io.github.nodetool-ai/nodetool" };
    expect(() => resolveMcpServerVersion(pkg, { name: "other", packages: [] })).toThrow("registry name");
    expect(() => resolveMcpServerVersion(pkg, { name: pkg.mcpName, packages: [{ registryType: "npm", identifier: "@nodetool-ai/cli" }] })).toThrow("no npm entry");
  });

  it("packs the standalone MCP registry entry with the actual prerelease version", () => {
    const root = mkdtempSync(join(tmpdir(), "mcp-prerelease-packed-"));
    const source = resolve(import.meta.dirname, "../..");
    try {
      mkdirSync(join(root, "scripts"));
      const packageRoot = join(root, "packages/cli-mcp");
      mkdirSync(packageRoot, { recursive: true });
      writeFileSync(join(root, "package.json"), JSON.stringify({ private: true, type: "module" }));
      copyFileSync(join(source, "scripts/prepare-publish.mjs"), join(root, "scripts/prepare-publish.mjs"));
      const pkg = JSON.parse(readFileSync(join(source, "packages/cli-mcp/package.json"), "utf8"));
      pkg.version = "1.2.3-next.4";
      writeFileSync(join(packageRoot, "package.json"), JSON.stringify(pkg));
      copyFileSync(join(source, "packages/cli-mcp/server.json"), join(packageRoot, "server.json"));
      cpSync(join(source, "packages/cli-mcp/dist"), join(packageRoot, "dist"), { recursive: true });
      const prepared = spawnSync(process.execPath, [join(root, "scripts/prepare-publish.mjs")], { cwd: root, encoding: "utf8" });
      expect(prepared.status, prepared.stdout + prepared.stderr).toBe(0);
      const packed = spawnSync("npm", ["pack", "--json", "--pack-destination", root], { cwd: packageRoot, encoding: "utf8" });
      expect(packed.status, packed.stdout + packed.stderr).toBe(0);
      const [artifact] = JSON.parse(packed.stdout);
      const extracted = spawnSync("tar", ["-xOf", join(root, artifact.filename), "package/server.json"], { encoding: "utf8" });
      expect(extracted.status, extracted.stderr).toBe(0);
      const server = JSON.parse(extracted.stdout);
      expect(server.name).toBe("io.github.nodetool-ai/nodetool");
      expect(server.version).toBe(pkg.version);
      expect(server.repository.subfolder).toBe("packages/cli-mcp");
      expect(server.packages).toMatchObject([{ identifier: pkg.name, version: pkg.version, packageArguments: [{ type: "positional", value: "serve" }] }]);
      expect(pkg.bin).toHaveProperty("nodetool-mcp");
      expect(artifact.files.some(file => file.path === pkg.bin["nodetool-mcp"])).toBe(true);
    } finally { rmSync(root, { recursive: true }); }
  });
});
