import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { discoverSandboxCatalog } from "../src/index.js";

const roots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "sandbox-host-"));
  roots.push(root);
  mkdirSync(join(root, "node_modules"));
  return root;
}

function writePack(
  root: string,
  name: string,
  options: { source?: string; manifest?: unknown } = {}
): void {
  const dir = join(root, "node_modules", ...name.split("/"));
  mkdirSync(join(dir, "sandbox"), { recursive: true });
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({
      name,
      version: "1.0.0",
      nodetool: options.manifest ?? {
        sandboxModules: [{ name: ".", kind: "js", file: "sandbox/index.js" }]
      }
    })
  );
  writeFileSync(
    join(dir, "sandbox/index.js"),
    options.source ?? "export const value = 1;"
  );
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("discoverSandboxCatalog", () => {
  it("builds a catalog over every sandbox pack it finds", () => {
    const root = makeRoot();
    writePack(root, "@acme/math");
    writePack(root, "plain-pack");

    const host = discoverSandboxCatalog([join(root, "node_modules")]);

    expect(host.catalog.summaries().map((s) => s.specifier)).toEqual([
      "@acme/math",
      "plain-pack"
    ]);
    expect(host.failures).toEqual([]);
    expect(
      host.catalog.resolveForExecution([{ specifier: "@acme/math" }]).modules
    ).toHaveLength(1);
  });

  it("ignores packages that declare no sandbox modules", () => {
    const root = makeRoot();
    writePack(root, "host-pack", { manifest: { register: "register" } });

    const host = discoverSandboxCatalog([join(root, "node_modules")]);

    expect(host.discoveries).toEqual([]);
    expect(host.failures).toEqual([]);
  });

  it("reports a pack that violates the discovery contract without throwing", () => {
    const root = makeRoot();
    writePack(root, "bad-pack", { source: "const x = await import('node:fs');" });

    const host = discoverSandboxCatalog([join(root, "node_modules")]);

    expect(host.discoveries).toEqual([]);
    expect(host.failures).toHaveLength(1);
    expect(host.failures[0]?.code).toBe("discovery-failed");
    expect(host.catalog.diagnostics()).toHaveLength(1);
  });

  it("drops a package name claimed by two roots instead of picking one", () => {
    const near = makeRoot();
    const far = makeRoot();
    writePack(near, "@acme/math");
    writePack(far, "@acme/math", { source: "export const value = 2;" });

    const host = discoverSandboxCatalog([
      join(near, "node_modules"),
      join(far, "node_modules")
    ]);

    expect(host.catalog.summaries()).toEqual([]);
    expect(host.failures[0]?.code).toBe("duplicate-pack");
    const resolution = host.catalog.resolveForExecution([
      { specifier: "@acme/math" }
    ]);
    expect(resolution.modules).toEqual([]);
    expect(resolution.statuses[0]?.code).toBe("module-not-found");
  });

  it("returns an empty catalog when no search path exists", () => {
    const host = discoverSandboxCatalog([join(tmpdir(), "sandbox-host-missing")]);
    expect(host.catalog.summaries()).toEqual([]);
    expect(host.catalog.diagnostics()).toEqual([]);
  });
});
