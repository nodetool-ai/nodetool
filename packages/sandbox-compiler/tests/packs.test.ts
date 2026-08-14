/**
 * The shipped library packs, through the real path a third-party pack takes.
 *
 * No fixtures: the pack directories under `packages/sandbox-packs/` are the
 * ones users install. Each one is discovered from disk, compiled where it has
 * an npm entry, resolved through the catalog, and imported by the M1 loader
 * inside QuickJS — with nothing stubbed anywhere in between.
 *
 * Guest packs and host packs travel the same road; only the manifest entry and
 * what runs at the far end differ.
 */

import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SANDBOX_HOST_MODULES } from "@nodetool-ai/protocol";
import {
  BRIDGE_PACKS,
  discoverSandboxPack,
  SandboxPackDiscoveryError
} from "@nodetool-ai/node-sdk";
import { runInSandbox } from "@nodetool-ai/agents";

import { cleanup, writeFixturePack } from "./fixtures.js";
import { discoverPack, packDir, resolveOne } from "./pack-harness.js";

const workspace = mkdtempSync(join(tmpdir(), "nodetool-packs-test-"));

afterAll(() => cleanup(workspace));

describe("every shipped pack", () => {
  for (const pack of BRIDGE_PACKS) {
    describe(pack.specifier, () => {
      it("is a config-only pack: no authored code, one module", () => {
        const manifest = JSON.parse(
          readFileSync(join(packDir(pack.packName), "package.json"), "utf8")
        ) as {
          dependencies?: Record<string, string>;
          nodetool?: {
            recommended?: boolean;
            sandboxModules?: { kind?: string; npm?: string; file?: string; host?: string }[];
          };
        };
        const modules = manifest.nodetool?.sandboxModules ?? [];
        expect(modules).toHaveLength(1);
        expect(modules[0]?.file).toBeUndefined();
        // The registry mark the index reads.
        expect(manifest.nodetool?.recommended).toBe(true);
        if (pack.runs === "guest") {
          expect(modules[0]?.kind).toBe("js");
          expect(modules[0]?.npm).toBe(pack.library);
          // A guest pack compiles its own dependency, so it declares it.
          expect(manifest.dependencies?.[pack.library]).toBeTruthy();
          return;
        }
        expect(modules[0]?.kind).toBe("host");
        const hostId = modules[0]?.host ?? "";
        expect(SANDBOX_HOST_MODULES[hostId]?.packName).toBe(pack.packName);
        // A host pack ships nothing and depends on nothing: the library is a
        // dependency of @nodetool-ai/agents, where the implementation lives.
        expect(manifest.dependencies).toBeUndefined();
      });

      it("discovers, and its SKILL.md survives", async () => {
        const discovery = await discoverPack(pack.specifier);
        expect(discovery.name).toBe(pack.packName);
        expect(discovery.modules[0]?.specifier).toBe(pack.specifier);
        expect(discovery.modules[0]?.source).toBeDefined();
        if (pack.runs === "guest") {
          expect(
            discovery.statuses.some((status) => status.code === "npm-module-compiled")
          ).toBe(true);
        } else {
          expect(discovery.modules[0]?.kind).toBe("host");
        }
        expect(
          discovery.statuses.some(
            (status) => status.code === "skill-missing" || status.code === "skill-invalid"
          )
        ).toBe(false);
      });

      it("resolves for execution with no error", async () => {
        const { resolution } = await resolveOne(pack.specifier);
        expect(resolution.statuses.filter((status) => status.status === "error")).toEqual([]);
        expect(resolution.modules).toHaveLength(1);
      });
    });
  }
});

describe("a third-party pack claiming a host module", () => {
  it("is refused at discovery when it claims a real id", () => {
    // The trust rule, exercised where a manifest first meets NodeTool. `csv` is
    // real; `@acme/evil` is not the package the registry pins it to.
    const dir = writeFixturePack(workspace, "acme-evil", {
      name: "@acme/evil",
      version: "1.0.0",
      nodetool: {
        apiVersion: 1,
        sandboxModules: [{ name: ".", kind: "host", host: "csv" }]
      }
    });
    expect(() => discoverSandboxPack(dir)).toThrow(SandboxPackDiscoveryError);
    expect(() => discoverSandboxPack(dir)).toThrow(
      /belongs to @nodetool-ai\/sandbox-csv/
    );
  });

  it("is refused at discovery when it invents an id", () => {
    const dir = writeFixturePack(workspace, "acme-invented", {
      name: "@acme/invented",
      version: "1.0.0",
      nodetool: {
        apiVersion: 1,
        sandboxModules: [{ name: ".", kind: "host", host: "shell" }]
      }
    });
    expect(() => discoverSandboxPack(dir)).toThrow(
      /is not a host module NodeTool implements/
    );
  });
});

describe("sandbox-yaml end to end, in the guest", () => {
  it("parses and dumps YAML through the M1 loader", async () => {
    const { resolution } = await resolveOne("@nodetool-ai/sandbox-yaml");
    const result = await runInSandbox({
      code: `
        import yaml from "@nodetool-ai/sandbox-yaml";
        const loaded = yaml.load("name: nodetool\\ntags: [a, b]\\n");
        return { loaded, text: yaml.dump(loaded).trim() };
      `,
      modules: resolution
    });
    expect(result.error).toBeUndefined();
    expect(result.result).toMatchObject({
      loaded: { name: "nodetool", tags: ["a", "b"] }
    });
  });

  it("refuses a run whose saved digest no longer matches the compiled module", async () => {
    const { catalog } = await resolveOne("@nodetool-ai/sandbox-yaml");
    const drifted = catalog.resolveForExecution([
      { specifier: "@nodetool-ai/sandbox-yaml", contentDigest: "0".repeat(64) }
    ]);
    expect(drifted.statuses[0]?.code).toBe("content-digest-mismatch");
  });
});

describe("sandbox-decimal end to end, in the guest", () => {
  it("adds decimals without float noise", async () => {
    const { resolution } = await resolveOne("@nodetool-ai/sandbox-decimal");
    const result = await runInSandbox({
      code: `
        import Decimal from "@nodetool-ai/sandbox-decimal";
        return new Decimal("0.1").plus("0.2").toFixed(1);
      `,
      modules: resolution
    });
    expect(result.error).toBeUndefined();
    expect(result.result).toBe("0.3");
  });
});

describe("sandbox-jmespath end to end, in the guest", () => {
  it("queries a JSON document", async () => {
    const { resolution } = await resolveOne("@nodetool-ai/sandbox-jmespath");
    const result = await runInSandbox({
      code: `
        import jmespath from "@nodetool-ai/sandbox-jmespath";
        return jmespath.search({ items: [{ name: "a" }, { name: "b" }] }, "items[*].name");
      `,
      modules: resolution
    });
    expect(result.error).toBeUndefined();
    expect(result.result).toEqual(["a", "b"]);
  });
});

describe("sandbox-markdown end to end, in the guest", () => {
  it("lexes headers, links, and code blocks through the M1 loader", async () => {
    const { resolution } = await resolveOne("@nodetool-ai/sandbox-markdown");
    const result = await runInSandbox({
      code: `
        import { marked } from "@nodetool-ai/sandbox-markdown";
        const md = "# Title\\n\\nSee [docs](https://x.test).\\n\\n\`\`\`js\\ncode();\\n\`\`\`\\n";
        const tokens = marked.lexer(md);
        const headers = tokens.filter((t) => t.type === "heading")
          .map((t) => ({ level: t.depth, text: t.text }));
        const codeBlocks = tokens.filter((t) => t.type === "code")
          .map((t) => ({ language: t.lang, code: t.text }));
        return { headers, codeBlocks };
      `,
      modules: resolution
    });
    expect(result.error).toBeUndefined();
    expect(result.result).toEqual({
      headers: [{ level: 1, text: "Title" }],
      codeBlocks: [{ language: "js", code: "code();" }]
    });
  });
});

describe("a host pack end to end, in the guest", () => {
  it("runs papaparse on the host behind the generated facade", async () => {
    const { resolution } = await resolveOne("@nodetool-ai/sandbox-csv");
    const result = await runInSandbox({
      code: `
        import { parse } from "@nodetool-ai/sandbox-csv";
        return await parse("name,city\\nada,london\\n");
      `,
      modules: resolution
    });
    expect(result.error).toBeUndefined();
    expect(result.result).toEqual([{ name: "ada", city: "london" }]);
  });

  it("round-trips an archive through fflate on the host", async () => {
    const { resolution } = await resolveOne("@nodetool-ai/sandbox-zip");
    const result = await runInSandbox({
      code: `
        import { zip, unzip } from "@nodetool-ai/sandbox-zip";
        const archive = await zip({ "note.txt": "hello" });
        const entries = await unzip(archive);
        return { text: new TextDecoder().decode(entries["note.txt"]) };
      `,
      modules: resolution
    });
    expect(result.error).toBeUndefined();
    expect(result.result).toEqual({ text: "hello" });
  });

  it("changes the module digest when the guest surface changes", async () => {
    // A host pack ships no bytes, so the digest is over the facade and the
    // export list. Two discoveries of the same pack agree; a different pack
    // does not.
    const csv = await resolveOne("@nodetool-ai/sandbox-csv");
    const again = await resolveOne("@nodetool-ai/sandbox-csv");
    const zip = await resolveOne("@nodetool-ai/sandbox-zip");
    expect(csv.resolution.modules[0]?.contentDigest).toBe(
      again.resolution.modules[0]?.contentDigest
    );
    expect(csv.resolution.modules[0]?.contentDigest).not.toBe(
      zip.resolution.modules[0]?.contentDigest
    );
  });
});

describe("sandbox-dates in the guest", () => {
  it("formats a date with date-fns, which the guest has no Intl for", async () => {
    const { resolution } = await resolveOne("@nodetool-ai/sandbox-dates");
    const result = await runInSandbox({
      code: `
        import { addDays, format, parseISO } from "@nodetool-ai/sandbox-dates";
        return { day: format(addDays(parseISO("2026-08-10T00:00:00Z"), 5), "yyyy-MM-dd") };
      `,
      modules: resolution
    });
    expect(result.error).toBeUndefined();
    expect(result.result).toEqual({ day: "2026-08-15" });
  });
});
