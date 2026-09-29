/**
 * Every fenced ```js block in the timeline pack skill and the motion craft
 * skills that teach it is either a standalone script (imports the pack and
 * calls `v.save()`) or a fragment that assumes variables from the
 * surrounding prose. Fragments are marked with a leading `// fragment`
 * comment in the markdown source and skipped here; every standalone block
 * runs through the real sandbox — the same host `codeact-timeline-package
 * .test.ts` uses — and must save with zero validation errors.
 *
 * This is what keeps the skill docs honest: a code sample that no longer
 * matches the pack's real API fails this test, not a user's build.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createSandboxModuleCatalog,
  discoverSandboxPack
} from "@nodetool-ai/node-sdk";
import { initTestDb } from "@nodetool-ai/models";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";
import { createChatCodeActSession } from "../src/codeact/chat-codeact.js";
import { createMockContext } from "./_helpers/mock-context.js";

const here = dirname(fileURLToPath(import.meta.url));

const discovery = discoverSandboxPack(
  join(here, "..", "..", "sandbox-packs", "sandbox-timeline")
);
if (discovery === undefined) {
  throw new Error("The shipped timeline pack is missing");
}
const catalog = createSandboxModuleCatalog([discovery]);

const TOOLS = [
  "create_timeline",
  "set_timeline_document",
  "validate_timeline",
  "get_timeline",
  "edit_timeline"
].map((name) => ({
  name,
  description: name,
  inputSchema: { type: "object", properties: {} }
}));

const DOC_FILES = [
  "packages/sandbox-packs/sandbox-timeline/SKILL.md",
  "packages/system-skills/motion-graphics/SKILL.md",
  "packages/system-skills/frame-composition/SKILL.md",
  "packages/system-skills/motion-direction/SKILL.md",
  "packages/system-skills/motion-principles/SKILL.md",
  "packages/system-skills/logo-reveal/SKILL.md",
  "packages/system-skills/timeline-edit-ops/SKILL.md"
];

const REPO_ROOT = join(here, "..", "..", "..");

interface SampleBlock {
  file: string;
  index: number;
  code: string;
  isFragment: boolean;
}

function extractBlocks(): SampleBlock[] {
  const blocks: SampleBlock[] = [];
  for (const relPath of DOC_FILES) {
    const text = readFileSync(join(REPO_ROOT, relPath), "utf8");
    const matches = text.matchAll(/```js\n([\s\S]*?)```/g);
    let index = 0;
    for (const m of matches) {
      const code = m[1];
      blocks.push({
        file: relPath,
        index,
        code,
        isFragment: code.trimStart().startsWith("// fragment")
      });
      index++;
    }
  }
  return blocks;
}

const allBlocks = extractBlocks();
const runnable = allBlocks.filter((b) => !b.isFragment);
const fragments = allBlocks.filter((b) => b.isFragment);

describe("skill doc timeline samples", () => {
  it(`found ${allBlocks.length} js blocks across the docs (${runnable.length} runnable, ${fragments.length} fragments)`, () => {
    // Sanity floor so a parsing regression (e.g. a doc losing its fences)
    // doesn't silently collapse this suite to zero coverage.
    expect(allBlocks.length).toBeGreaterThanOrEqual(20);
    expect(runnable.length).toBeGreaterThanOrEqual(2);
  });

  for (const block of runnable) {
    it(`${block.file} block #${block.index} runs and saves with zero errors`, async () => {
      initTestDb();
      const context = createMockContext();
      const run = createCapabilityRun({ context, gate: UNGATED });
      const session = createChatCodeActSession({
        tools: TOOLS,
        sandboxModuleCatalog: catalog,
        executeTool: (call) => run.invoke(call.name, call.args)
      });

      const raw = await session.executeAction({ code: block.code });
      const observation = JSON.parse(raw);

      expect(observation.ok, observation.error).toBe(true);
      expect(observation.result?.errors ?? []).toEqual([]);
    });
  }

  for (const block of fragments) {
    it.skip(`${block.file} block #${block.index} is a fragment (not standalone)`, () => {});
  }
});
