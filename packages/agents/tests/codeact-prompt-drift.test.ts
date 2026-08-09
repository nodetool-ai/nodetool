import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  buildCodeActSystemPrompt,
  chatUnavailableBridges
} from "../src/codeact/prompt.js";
import { CODEACT_INJECTED_GLOBALS } from "../src/codeact/tool-api.js";
import { getSandboxManifest } from "../src/code-gen/sandbox-manifest.js";
import { unknownApiReferences } from "../src/code-gen/sandbox-prompt.js";

/**
 * Prose words the reference extractor reads as API names. Each is ordinary
 * English in an example, not something the guest has to provide.
 */
const PROSE_ALLOWLIST = new Set([
  // `parallelMap(items, …)` in the concurrency bullet names its own argument.
  "items"
]);

const KNOWN = new Set<string>([...CODEACT_INJECTED_GLOBALS, ...PROSE_ALLOWLIST]);

function undocumented(prompt: string): string[] {
  return unknownApiReferences(prompt).filter((name) => !KNOWN.has(name));
}

const VARIANTS = ["step", "chat"] as const;

describe("CodeAct prompt / sandbox drift", () => {
  for (const variant of VARIANTS) {
    it(`names no API the sandbox lacks (${variant})`, () => {
      const prompt = buildCodeActSystemPrompt({ tools: [], variant });
      expect(undocumented(prompt)).toEqual([]);
    });
  }

  it("flags an API the sandbox does not have", () => {
    const bogus = buildCodeActSystemPrompt({
      tools: [],
      variant: "step",
      preamble: "Group the rows with lodash.groupBy(rows, 'id')."
    });
    expect(undocumented(bogus)).toContain("lodash");
  });

  it("carries the manifest's notes into the summary", () => {
    const manifest = getSandboxManifest();
    const intl = manifest.notes.find((note) => note.text.includes("Intl"));
    const prompt = buildCodeActSystemPrompt({ tools: [], variant: "step" });
    // The note may disappear once `Intl` is listed as a blocked global; what
    // must not happen is the prompt staying silent about it either way.
    if (intl) {
      expect(prompt).toContain(intl.text);
    } else {
      expect(manifest.blockedGlobals).toContain("Intl");
      expect(prompt).toContain("Intl");
    }
  });

  it("keeps Code-node-only notes out of both variants", () => {
    // A code action completes through finish(), so a rule about the node's
    // declared outputs contradicts the contract. The audience tag decides this,
    // not the wording — rewording a note must not leak it in here.
    const nodeOnly = getSandboxManifest().notes.filter(
      (note) => note.audience === "code-node"
    );
    expect(nodeOnly.length).toBeGreaterThan(0);
    for (const variant of ["step", "chat"] as const) {
      const prompt = buildCodeActSystemPrompt({ tools: [], variant });
      for (const note of nodeOnly) {
        expect(prompt, `${variant} prompt leaks a code-node note`).not.toContain(
          note.text
        );
      }
    }
  });

  it("states the module-loader rule once, from the manifest", () => {
    const prompt = buildCodeActSystemPrompt({ tools: [], variant: "step" });
    const occurrences = prompt.split("no module loader").length - 1;
    expect(occurrences).toBe(1);
  });
});

describe("chat variant exclusions", () => {
  const chatSource = readFileSync(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../src/codeact/chat-codeact.ts"
    ),
    "utf-8"
  );

  it("matches what a chat action actually disables", () => {
    expect(chatUnavailableBridges()).toEqual([
      "assetToSandbox",
      "fetch",
      "getSecret",
      "sandboxToAsset",
      "workspace"
    ]);
  });

  it("is what createChatCodeActSession enforces", () => {
    // No `context` reaches the sandbox, so every context-only bridge throws.
    const call = chatSource.slice(chatSource.indexOf("await runInSandbox({"));
    const args = call.slice(0, call.indexOf("\n    });"));
    expect(args).not.toMatch(/^\s*context:/m);
    expect(args).toContain("maxFetchCalls: 0");
  });

  it("hides every excluded bridge from the chat prompt", () => {
    const manifest = getSandboxManifest();
    const chat = buildCodeActSystemPrompt({ tools: [], variant: "chat" });
    const step = buildCodeActSystemPrompt({ tools: [], variant: "step" });
    for (const name of chatUnavailableBridges()) {
      const bridge = manifest.bridges[name as keyof typeof manifest.bridges];
      for (const member of bridge.members) {
        expect(step).toContain(member.signature);
        expect(chat).not.toContain(member.signature);
      }
    }
  });
});
