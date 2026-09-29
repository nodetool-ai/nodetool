/**
 * The 20 fragments `skill-timeline-samples.test.ts` skips (they read
 * variables the surrounding prose defines, not the fragment itself, so they
 * cannot run standalone) still make a claim about the pack's real API. This
 * type-checks that claim against the pack's own shipped `.d.ts`, the same
 * checker `nodetool jsscript validate` runs
 * (`@nodetool-ai/execution/js-script-debug`'s `typeCheckAgainstPackDts`).
 *
 * Per fragment: prepend `import * as T from "@nodetool-ai/sandbox-timeline"`
 * plus `declare const v: T.VideoBuilder; declare const s: T.SceneApi;`, then
 * check. Every "Cannot find name 'X'" diagnostic names a binding the prose
 * supplies rather than the fragment itself (`title`, `mark`, an asset id) —
 * add `declare const X: any;` for each and check once more. A diagnostic
 * that survives that second pass is a real mismatch against the pack's own
 * types (a wrong option or method name), not a missing free binding.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  typeCheckAgainstPackDts,
  type PackDtsSources
} from "@nodetool-ai/execution/js-script-debug";

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, "..", "..", "..");

const PACK_SPECIFIER = "@nodetool-ai/sandbox-timeline";
const PACK_DTS_PATH = join(
  REPO_ROOT,
  "packages/sandbox-packs/sandbox-timeline/sandbox/index.d.ts"
);
const packDtsSources: PackDtsSources = new Map([
  [PACK_SPECIFIER, PACK_DTS_PATH]
]);

const DOC_FILES = [
  "packages/sandbox-packs/sandbox-timeline/SKILL.md",
  "packages/system-skills/motion-graphics/SKILL.md",
  "packages/system-skills/frame-composition/SKILL.md",
  "packages/system-skills/motion-direction/SKILL.md",
  "packages/system-skills/motion-principles/SKILL.md",
  "packages/system-skills/logo-reveal/SKILL.md",
  "packages/system-skills/timeline-edit-ops/SKILL.md"
];

interface FragmentBlock {
  file: string;
  index: number;
  code: string;
}

function extractFragments(): FragmentBlock[] {
  const blocks: FragmentBlock[] = [];
  for (const relPath of DOC_FILES) {
    const text = readFileSync(join(REPO_ROOT, relPath), "utf8");
    const matches = text.matchAll(/```js\n([\s\S]*?)```/g);
    let index = 0;
    for (const m of matches) {
      const code = m[1];
      if (code.trimStart().startsWith("// fragment")) {
        // Drop the marker line itself — it is prose for the doc reader, not
        // part of the sample.
        const body = code.replace(/^\/\/ fragment\n/, "");
        blocks.push({ file: relPath, index, code: body });
      }
      index++;
    }
  }
  return blocks;
}

const BASE_PREAMBLE = `import * as T from "${PACK_SPECIFIER}";
declare const v: T.VideoBuilder;
declare const s: T.SceneApi;
`;

const CANNOT_FIND_NAME = /Cannot find name '([^']+)'/g;
const RETURN_OUTSIDE_FUNCTION = /return' statement can only be used within a function body/;

async function typeCheckFragment(body: string) {
  // Pass 1: only the pack's own types in scope.
  let code = BASE_PREAMBLE + body;
  let diagnostics = await typeCheckAgainstPackDts(code, packDtsSources);

  // A body written for a different host context (e.g. a curve-generator
  // `code` field, executed as a function body, never as a module) fails on
  // its bare top-level `return` before anything else is checked. Wrapping it
  // in a function is the same accommodation the real host gives it —
  // nothing about the sample's own code changes.
  if (diagnostics.some((d) => RETURN_OUTSIDE_FUNCTION.test(d.message))) {
    code = `${BASE_PREAMBLE}(function () {\n${body}\n})();\n`;
    diagnostics = await typeCheckAgainstPackDts(code, packDtsSources);
  }

  // Pass 2: declare every name the prose assumes but this fragment doesn't
  // define, then check again. Collected from every diagnostic, not just the
  // first, since more than one free binding is common (`title`, `sub`, `bar`).
  const freeNames = new Set<string>();
  for (const d of diagnostics) {
    for (const m of d.message.matchAll(CANNOT_FIND_NAME)) {
      freeNames.add(m[1]);
    }
  }
  if (freeNames.size > 0) {
    const stubs = [...freeNames].map((name) => `declare const ${name}: any;`).join("\n");
    code = code.replace(BASE_PREAMBLE, `${BASE_PREAMBLE}${stubs}\n`);
    diagnostics = await typeCheckAgainstPackDts(code, packDtsSources);
  }

  return { diagnostics, code };
}

const fragments = extractFragments();

describe("skill doc fragment type-check", () => {
  it(`found ${fragments.length} fragments to type-check`, () => {
    expect(fragments.length).toBeGreaterThanOrEqual(15);
  });

  for (const fragment of fragments) {
    it(`${fragment.file} block #${fragment.index} type-checks against the pack's .d.ts`, async () => {
      const { diagnostics } = await typeCheckFragment(fragment.code);
      const messages = diagnostics.map((d) => d.message);
      expect(messages).toEqual([]);
    });
  }
});
