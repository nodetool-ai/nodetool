/**
 * The model-line → prompting-skill table, checked against three things it can
 * silently disagree with: the skills actually shipped, the model ids the
 * providers actually serve, and the capability names the skills name in prose.
 *
 * Every failure mode here is invisible at runtime. A table entry naming a
 * skill nobody shipped answers `find_model` with a `load_skill` call that
 * fails. A pattern that matches nothing is a guide that never triggers, and a
 * green test proves nothing unless it also proves the scan found ids at all. A
 * description that names an id its own pattern rejects makes the catalog and
 * the mechanical path disagree about which model a guide covers.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BaseProvider } from "@nodetool-ai/runtime";
import type {
  ImageModel,
  ProcessingContext,
  ProviderId
} from "@nodetool-ai/runtime";

import {
  MODEL_PROMPTING_SKILLS,
  promptingSkillFor
} from "../src/model-prompting-skills.js";
import { listCapabilitySpecs } from "../src/capabilities/index.js";
import { toolFromCapability } from "../src/capabilities/adapters.js";
import { UNGATED, createCapabilityRun } from "../src/capabilities/invoke.js";
import { findModel } from "../src/capabilities/models.js";
import { parseSkillMarkdown } from "../src/system-skills.js";

const SKILLS_DIR = fileURLToPath(
  new URL("../../system-skills", import.meta.url)
);

/**
 * The shipped provider manifests, read straight off disk. Importing the node
 * packages would pull four decorator-laden module graphs into a unit test for
 * a regex table; the manifests are plain JSON and are the same artifact those
 * packages read.
 */
const MANIFESTS = [
  "fal-nodes/src/fal-manifest.json",
  "kie-nodes/src/kie-manifest.json",
  "atlascloud-nodes/src/atlascloud-manifest.json",
  "replicate-nodes/src/replicate-manifest.json"
];

/** Every model id the shipped manifests name, lowercased. */
function manifestModelIds(): string[] {
  const ids = new Set<string>();
  for (const relative of MANIFESTS) {
    const path = fileURLToPath(new URL(`../../${relative}`, import.meta.url));
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    const rows = Array.isArray(parsed)
      ? parsed
      : Object.values(parsed as Record<string, unknown>).flat();
    for (const row of rows) {
      if (typeof row !== "object" || row === null) continue;
      const id = (row as Record<string, unknown>)["endpointId"];
      if (typeof id === "string") ids.add(id.toLowerCase());
    }
  }
  return [...ids];
}

function shippedSkillNames(): Set<string> {
  const names = new Set<string>();
  for (const entry of readdirSync(SKILLS_DIR)) {
    let source: string;
    try {
      source = readFileSync(`${SKILLS_DIR}/${entry}/SKILL.md`, "utf8");
    } catch {
      continue; // Not a skill directory — README.md, the licence file.
    }
    const parsed = parseSkillMarkdown(source);
    if (parsed) names.add(parsed.name);
  }
  return names;
}

function skillBody(name: string): string {
  return readFileSync(`${SKILLS_DIR}/${name}/SKILL.md`, "utf8");
}

describe("the model-line prompting table", () => {
  const ids = manifestModelIds();

  it("reads model ids off the shipped manifests at all", () => {
    // Without this the two checks below pass on an empty list.
    expect(ids.length).toBeGreaterThan(1000);
    expect(ids).toContain("fal-ai/nano-banana-pro");
  });

  it("names only skills this build ships", () => {
    const shipped = shippedSkillNames();
    const missing = MODEL_PROMPTING_SKILLS.map((entry) => entry.skill).filter(
      (name) => !shipped.has(name)
    );
    expect(missing, "in the table but not in packages/system-skills").toEqual(
      []
    );
  });

  it("gives every line at least one model a provider actually serves", () => {
    const unmatched = MODEL_PROMPTING_SKILLS.filter(
      (entry) => !ids.some((id) => entry.pattern.test(id))
    ).map((entry) => entry.line);
    expect(unmatched, "no shipped model id matches this line").toEqual([]);
  });

  it("claims no two lines for the same model id", () => {
    const contested = ids.filter(
      (id) =>
        MODEL_PROMPTING_SKILLS.filter((entry) => entry.pattern.test(id))
          .length > 1
    );
    expect(contested).toEqual([]);
  });

  /**
   * The version boundaries, spelled out. Each left-hand id is served today;
   * each right-hand one is a neighbour whose prompting rules differ, and an
   * over-broad pattern would hand it the wrong guide.
   */
  it.each([
    ["fal-ai/nano-banana-pro", "nano-banana-pro-prompting"],
    ["google/nano-banana-pro/text-to-image", "nano-banana-pro-prompting"],
    ["nano-banana-pro", "nano-banana-pro-prompting"],
    ["openai/gpt-image-2", "gpt-image-2-prompting"],
    ["gpt-image-2-text-to-image", "gpt-image-2-prompting"],
    ["openai/gpt-image-2/edit", "gpt-image-2-prompting"],
    ["fal-ai/flux-2/klein/9b", "flux-2-klein-prompting"],
    ["black-forest-labs/flux-2-klein-4b-base", "flux-2-klein-prompting"],
    ["bytedance/seedance-2.0/text-to-video", "seedance-2-prompting"],
    ["bytedance/seedance-2.5/reference-to-video", "seedance-2-prompting"],
    ["bytedance/seedance-2-mini", "seedance-2-prompting"],
    ["fal-ai/veo3.1/fast/image-to-video", "veo-3-prompting"],
    ["google/veo-3.1-lite", "veo-3-prompting"],
    ["fal-ai/veo3/image-to-video", "veo-3-prompting"],
    ["minimax/h3/text-to-video", "minimax-h3-prompting"],
    ["minimax/h3-max-turbo/image-to-video", "minimax-h3-prompting"],
    ["alibaba/wan-2.6/text-to-video", "wan-2-6-prompting"],
    ["wan-video/wan2.6-i2v-flash", "wan-2-6-prompting"]
  ])("routes %s to %s", (id, skill) => {
    expect(promptingSkillFor(id)).toBe(skill);
  });

  it.each([
    "fal-ai/nano-banana-2",
    "google/nano-banana-lite/edit",
    "openai/gpt-image-1.5/text-to-image",
    "fal-ai/gpt-image-1-mini",
    "fal-ai/flux-2-pro/edit",
    "black-forest-labs/flux-2-dev",
    "bytedance/seedance-1.5-pro",
    "fal-ai/bytedance/seedance/v1/pro/text-to-video",
    "fal-ai/minimax/hailuo-2.3/pro/text-to-video",
    "minimax/hailuo-2.3/t2v-pro",
    "wan-video/wan-2.5-t2v",
    "alibaba/wan-2.7/text-to-video"
  ])("claims nothing for %s", (id) => {
    expect(promptingSkillFor(id)).toBeNull();
  });
});

describe("the shipped prompting skills", () => {
  const names = MODEL_PROMPTING_SKILLS.map((entry) => entry.skill);

  /**
   * The catalog line is the other trigger: an agent that already knows its
   * model reads the description and calls `load_skill` without going through
   * `find_model`. A description naming an id the pattern rejects means the two
   * paths disagree, and the one that reads as authoritative is the wrong one.
   */
  it.each(names)("%s: every model id in its description matches it", (name) => {
    const parsed = parseSkillMarkdown(skillBody(name));
    expect(parsed, `${name} has unreadable frontmatter`).not.toBeNull();
    const description = parsed?.description ?? "";
    // Ids as the description writes them: a slash path, or a hyphenated slug
    // carrying a digit. Bare prose words carry neither.
    const quoted = [
      ...description.matchAll(/\b[a-z0-9]+(?:[/-][a-z0-9.]+)+\b/g)
    ].map((match) => match[0]);
    expect(quoted.length, `${name} names no model ids`).toBeGreaterThan(2);
    const wrong = quoted.filter(
      (id) => promptingSkillFor(id) !== null && promptingSkillFor(id) !== name
    );
    expect(wrong, "named in this description, routed elsewhere").toEqual([]);
  });

  /**
   * Prose drifts where code cannot follow it: a capability gets renamed and
   * the skill keeps teaching the old spelling. Same protection the motion
   * skills get from motion-graphics-skill-names.test.ts.
   */
  it("names only capabilities that exist", () => {
    const known = new Set(listCapabilitySpecs().map((spec) => spec.name));
    const prefixes = [
      "generate_",
      "edit_image",
      "animate_image",
      "find_model",
      "load_skill",
      "await_generation",
      "critique_image",
      "score_image_",
      "analyze_",
      "detect_",
      "understand_"
    ];
    const named = new Set<string>();
    for (const name of names) {
      for (const match of skillBody(name).matchAll(/\b([a-z][a-z0-9_]*)\b/g)) {
        const token = match[1] as string;
        if (prefixes.some((prefix) => token.startsWith(prefix))) {
          named.add(token);
        }
      }
    }
    expect(named.size, "read no capability names out of the skills").toBeGreaterThan(8);
    expect([...named].filter((token) => !known.has(token))).toEqual([]);
  });
});

class FakeImageProvider extends BaseProvider {
  constructor(
    id: ProviderId,
    private readonly models: ImageModel[]
  ) {
    super(id);
  }
  override async getAvailableImageModels(): Promise<ImageModel[]> {
    return this.models;
  }
}

describe("find_model surfaces the guide", () => {
  const ctx = { userId: "u1" } as ProcessingContext;
  const tool = (models: ImageModel[]) =>
    toolFromCapability(findModel.spec, findModel.impl, (context) =>
      createCapabilityRun({
        context,
        gate: UNGATED,
        providers: {
          fal_ai: new FakeImageProvider("fal_ai" as ProviderId, models)
        }
      })
    );

  it("attaches prompting_skill to a matching route and lifts it", async () => {
    const result = (await tool([
      {
        id: "fal-ai/nano-banana-pro",
        name: "Nano Banana Pro",
        provider: "fal_ai"
      } as ImageModel
    ]).process(ctx, { capability: "text_to_image" })) as {
      prompting_skill?: string;
      results: { prompting_skill?: string }[];
    };
    expect(result.results[0]?.prompting_skill).toBe(
      "nano-banana-pro-prompting"
    );
    expect(result.prompting_skill).toBe("nano-banana-pro-prompting");
  });

  it("leaves the field off a model no guide covers", async () => {
    const result = (await tool([
      { id: "dall-e-3", name: "DALL·E 3", provider: "fal_ai" } as ImageModel
    ]).process(ctx, { capability: "text_to_image" })) as {
      prompting_skill?: string;
      results: { prompting_skill?: string }[];
    };
    expect(result.results[0]).not.toHaveProperty("prompting_skill");
    expect(result).not.toHaveProperty("prompting_skill");
  });
});
