import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildSandbox } from "../src/js-sandbox.js";
import {
  getSandboxManifest,
  sandboxManifestNames
} from "../src/code-gen/sandbox-manifest.js";
import {
  renderSandboxApiReference,
  unknownApiReferences,
  extractApiReferences
} from "../src/code-gen/sandbox-prompt.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);
const CHAT_INTEGRATION = path.join(
  repoRoot,
  "web/src/hooks/editor/useChatIntegration.ts"
);
const OUTPUT_INFERENCE = path.join(
  repoRoot,
  "web/src/utils/codeOutputInference.ts"
);

/** Names the Code node or JS syntax supplies — not part of the sandbox. */
const NODE_LEVEL_NAMES = new Set([
  "undefined",
  "true",
  "false",
  "null",
  "NaN",
  "Infinity",
  "this",
  "arguments",
  "globalThis",
  "self",
  "window",
  "document",
  "process",
  "code",
  "timeout",
  "state",
  "__maxIter"
]);

function readIfPresent(file: string): string | null {
  return existsSync(file) ? readFileSync(file, "utf-8") : null;
}

describe("sandbox manifest", () => {
  const manifest = getSandboxManifest();

  it("documents exactly the members each bridge exposes", () => {
    const { sandbox } = buildSandbox();
    for (const bridge of Object.values(manifest.bridges)) {
      if (bridge.internal) continue;
      const value = sandbox[bridge.name];
      if (bridge.kind === "function") {
        expect(typeof value, bridge.name).toBe("function");
        continue;
      }
      const documented = bridge.members
        .map((m) => m.name.split(".")[1])
        .sort();
      expect(Object.keys(value as object).sort(), bridge.name).toEqual(
        documented
      );
    }
  });

  it("reports the resolved defaults and clamp ceilings", () => {
    const fetchCalls = manifest.limits.find((l) => l.key === "maxFetchCalls");
    expect(fetchCalls?.value).toBe(20);
    expect(fetchCalls?.ceiling).toBe(100);
    for (const limit of manifest.limits) {
      expect(Number.isFinite(limit.value), limit.key).toBe(true);
    }
  });

  it("excludes internal plumbing from the documented surface", () => {
    expect(manifest.bridges.__maxIter.internal).toBe(true);
    expect(manifest.blockedGlobals).toContain("eval");
    expect(manifest.nativeGlobals).toContain("JSON");
    expect(manifest.nativeGlobals).not.toContain("setTimeout");
  });
});

describe("authoring instructions name only APIs the sandbox has", () => {
  it("flags a reference the manifest does not carry", () => {
    // The bug this guards against: prompts advertising libraries that were
    // never bridged into the guest.
    expect(
      unknownApiReferences("Use _.groupBy(rows) and dayjs().format()")
    ).toEqual(expect.arrayContaining(["_", "dayjs"]));
  });

  it("keeps ordinary prose out of the reference set", () => {
    expect(extractApiReferences("the header row (default true)")).toEqual([]);
  });

  it("holds for the rendered API reference", () => {
    expect(unknownApiReferences(renderSandboxApiReference())).toEqual([]);
  });

  it("holds for the editor chat sandbox docs", () => {
    const source = readIfPresent(CHAT_INTEGRATION);
    if (!source) return;
    const block = source.match(/<sandbox_api>([\s\S]*?)<\/sandbox_api>/);
    expect(block, "sandbox_api block in useChatIntegration.ts").toBeTruthy();
    expect(unknownApiReferences(block![1])).toEqual([]);
  });
});

describe("web input inference globals", () => {
  it("matches the sandbox surface", () => {
    const source = readIfPresent(OUTPUT_INFERENCE);
    if (!source) return;
    const literal = source.match(
      /const SANDBOX_GLOBALS = new Set\(\[([\s\S]*?)\]\)/
    );
    expect(literal, "SANDBOX_GLOBALS in codeOutputInference.ts").toBeTruthy();
    const webNames = new Set(
      [...literal![1].matchAll(/"([^"]+)"/g)].map((m) => m[1])
    );

    const manifest = getSandboxManifest();
    const documented = new Set(
      [...sandboxManifestNames(manifest)].filter((n) => !n.includes("."))
    );
    for (const name of manifest.blockedGlobals) documented.add(name);
    documented.delete("__maxIter");

    const missing = [...documented].filter((n) => !webNames.has(n));
    expect(missing, "sandbox names the web set omits").toEqual([]);

    const phantom = [...webNames].filter(
      (n) => !documented.has(n) && !NODE_LEVEL_NAMES.has(n)
    );
    expect(phantom, "web names the sandbox does not provide").toEqual([]);
  });
});
