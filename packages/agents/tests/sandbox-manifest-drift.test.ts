import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildSandbox, runInSandbox } from "../src/js-sandbox.js";
import {
  getSandboxManifest,
  sandboxManifestNames,
  GUEST_GLOBALS_SNAPSHOT
} from "../src/code-gen/sandbox-manifest.js";
import {
  renderSandboxApiReference,
  unknownApiReferences,
  extractApiReferences
} from "../src/code-gen/sandbox-prompt.js";
import {
  buildCodeGenSystemPrompt,
  buildCodeGenUserPrompt
} from "../src/code-gen/prompt.js";
import { SANDBOX_GLOBALS } from "@nodetool-ai/node-sdk";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);
const CHAT_INTEGRATION = path.join(
  repoRoot,
  "web/src/hooks/editor/useChatIntegration.ts"
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
  "inputs",
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
      const documented = [...bridge.members, ...(bridge.internalMembers ?? [])]
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

  it("documents the byte and number types the bridges return", () => {
    for (const name of ["Uint8Array", "ArrayBuffer", "DataView", "BigInt"]) {
      expect(manifest.nativeGlobals, name).toContain(name);
    }
  });

  it("names what other runtimes have and this guest does not", () => {
    for (const name of ["btoa", "atob", "structuredClone", "Intl"]) {
      expect(manifest.blockedGlobals, name).toContain(name);
      expect(manifest.nativeGlobals, name).not.toContain(name);
    }
  });
});

describe("guest globals snapshot", () => {
  // The manifest is built synchronously from a checked-in list because booting
  // QuickJS is async. This is what holds that list to the running guest.
  it("equals what the running sandbox reports", async () => {
    const run = await runInSandbox({
      code: "return Object.getOwnPropertyNames(globalThis)"
    });
    expect(run.error).toBeFalsy();
    const observed = (run.result as string[])
      .filter((name) => !name.startsWith("__"))
      .sort();
    expect(observed).toEqual([...GUEST_GLOBALS_SNAPSHOT]);
  }, 60_000);

  it("has no name the manifest calls blocked", () => {
    const blocked = getSandboxManifest().blockedGlobals;
    const present = blocked.filter((name) =>
      GUEST_GLOBALS_SNAPSHOT.includes(name)
    );
    expect(present, "blocked names the guest actually has").toEqual([]);
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

  it("holds for the code-generation prompts", () => {
    expect(unknownApiReferences(buildCodeGenSystemPrompt())).toEqual([]);
    expect(
      unknownApiReferences(
        buildCodeGenUserPrompt({
          instruction: "Count the words in the text.",
          inputs: [{ name: "text", type: { type: "str" } }],
          expectedOutput: { name: "count", type: { type: "int" } }
        })
      )
    ).toEqual([]);
  });

  it("keeps the editor chat docs on the current module rule", () => {
    const source = readIfPresent(CHAT_INTEGRATION);
    if (!source) return;
    // The guest has a loader now; the retired claim must not survive here.
    expect(source).not.toContain("no module loader");
    // Nor the retired `packages` property — a body's imports are what resolve.
    expect(source).not.toContain("packages property");
    const block = source.match(/<sandbox_api>([\s\S]*?)<\/sandbox_api>/);
    expect(block![1]).toContain("sandbox packages the body imports");
  });

  it("holds for the editor chat sandbox docs", () => {
    const source = readIfPresent(CHAT_INTEGRATION);
    if (!source) return;
    const block = source.match(/<sandbox_api>([\s\S]*?)<\/sandbox_api>/);
    expect(block, "sandbox_api block in useChatIntegration.ts").toBeTruthy();
    expect(unknownApiReferences(block![1])).toEqual([]);
  });
});

/** Names the sandbox really puts in scope, as the manifest reports them. */
function documentedGlobals(): Set<string> {
  const manifest = getSandboxManifest();
  const documented = new Set(
    [...sandboxManifestNames(manifest)].filter((n) => !n.includes("."))
  );
  for (const name of manifest.blockedGlobals) documented.add(name);
  // Per-run injections (`inputs`, `state`, the tool bridge's `tools` and
  // `nodetool`) are part of the surface the node-sdk validator must accept.
  for (const name of manifest.nodeGlobals) documented.add(name);
  documented.delete("__maxIter");
  return documented;
}

/**
 * The node-sdk graph validator restates the manifest because it cannot import
 * it — the dependency runs the other way. Drift either way is a bug: a missing
 * name turns a legitimate bridge call into a bogus "not defined" error, an
 * extra one hides a real reference.
 *
 * The web editor used to keep a second copy for input inference. It no longer
 * needs one: inputs arrive on the `inputs` object, so inference reads
 * `inputs.name` instead of subtracting every sandbox global from the free
 * identifiers.
 */
function expectMatchesSandbox(names: ReadonlySet<string>, label: string): void {
  const documented = documentedGlobals();

  const missing = [...documented].filter((n) => !names.has(n));
  expect(missing, `sandbox names ${label} omits`).toEqual([]);

  const phantom = [...names].filter(
    (n) => !documented.has(n) && !NODE_LEVEL_NAMES.has(n)
  );
  expect(phantom, `${label} names the sandbox does not provide`).toEqual([]);
}

describe("graph validator globals", () => {
  it("matches the sandbox surface", () => {
    expectMatchesSandbox(SANDBOX_GLOBALS, "the node-sdk set");
  });
});
