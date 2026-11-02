/**
 * The model-line → prompting-skill table, checked against three things it can
 * silently disagree with: the skills actually shipped, the model ids the
 * providers actually serve (the four manifests plus the direct providers'
 * own ids), and the capability names the skills name in prose.
 *
 * Every failure mode here is invisible at runtime. A table entry naming a
 * skill nobody shipped answers `find_model` with a `load_skill` call that
 * fails. A pattern that matches nothing is a guide that never triggers, and a
 * green test proves nothing unless it also proves the scan found ids at all. A
 * description that names an id no provider serves, or one its own pattern
 * rejects, makes `list_skills` and `find_model` disagree about which model a
 * guide covers.
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
      // FAL and Replicate name the route `endpointId`; kie and AtlasCloud name
      // it `modelId`. Reading only the first spelling left two providers'
      // catalogs out of every check below, so a pattern could match nothing
      // they serve and still pass.
      const record = row as Record<string, unknown>;
      const id = record["endpointId"] ?? record["modelId"];
      if (typeof id === "string") ids.add(id.toLowerCase());
    }
  }
  return [...ids];
}

/**
 * Ids the direct providers name in their own model lists rather than through a
 * manifest, keyed by the provider file that declares each. The test reads the
 * file, so an id that is renamed there fails here instead of leaving a pattern
 * and a description pointing at nothing.
 */
const DIRECT_PROVIDER_IDS: Record<string, readonly string[]> = {
  "gemini-provider.ts": ["gemini-3-pro-image", "veo-3.1-generate-preview"],
  "elevenlabs-provider.ts": [
    "eleven_v3",
    "eleven_multilingual_v2",
    "eleven_turbo_v2_5",
    "eleven_flash_v2_5"
  ],
  "minimax-provider.ts": [
    "MiniMax-Hailuo-2.3",
    "MiniMax-Hailuo-02",
    "T2V-01-Director",
    "I2V-01-Director",
    "S2V-01"
  ],
  "kie-provider.ts": ["minimax-h3/reference-to-video"]
};

function directProviderSource(file: string): string {
  return readFileSync(
    fileURLToPath(
      new URL(`../../runtime/src/providers/${file}`, import.meta.url)
    ),
    "utf8"
  );
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

  it.each(Object.entries(DIRECT_PROVIDER_IDS))(
    "%s still declares the direct ids the table relies on",
    (file, declared) => {
      const source = directProviderSource(file);
      expect(declared.filter((id) => !source.includes(`"${id}"`))).toEqual([]);
    }
  );

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
    ["wan-video/wan2.6-i2v-flash", "wan-2-6-prompting"],
    ["fal-ai/kling-video/v3/pro/text-to-video", "kling-video-prompting"],
    ["fal-ai/kling-video/o3/pro/reference-to-video", "kling-video-prompting"],
    ["fal-ai/kling-video/v2.5-turbo/pro/text-to-video", "kling-video-prompting"],
    ["kling-3.0-omni/text-to-video", "kling-video-prompting"],
    ["kling/v2-5-turbo-text-to-video-pro", "kling-video-prompting"],
    ["kwaivgi/kling-video-o3-pro/text-to-video", "kling-video-prompting"],
    ["kwaivgi/kling-o1", "kling-video-prompting"],
    ["fal-ai/minimax/hailuo-2.3/pro/text-to-video", "hailuo-prompting"],
    ["minimax/hailuo-2.3/t2v-pro", "hailuo-prompting"],
    ["fal-ai/minimax/hailuo-02-fast/image-to-video", "hailuo-prompting"],
    ["fal-ai/minimax/video-01-director", "hailuo-prompting"],
    ["bytedance/seedream/v5/pro/text-to-image", "seedream-prompting"],
    ["fal-ai/bytedance/seedream/v4.5/edit", "seedream-prompting"],
    ["seedream/5-pro-image-to-image", "seedream-prompting"],
    ["bytedance/seedream-v4.5", "seedream-prompting"],
    ["alibaba/qwen-image-3/text-to-image", "qwen-image-prompting"],
    ["qwen-image-3.0-pro/edit", "qwen-image-prompting"],
    ["qwen/qwen-image-edit-plus", "qwen-image-prompting"],
    ["fal-ai/elevenlabs/tts/eleven-v3", "elevenlabs-audio-prompting"],
    ["fal-ai/elevenlabs/sound-effects/v2", "elevenlabs-audio-prompting"],
    ["elevenlabs/text-to-dialogue-v3", "elevenlabs-audio-prompting"],
    ["elevenlabs/music", "elevenlabs-audio-prompting"],
    ["fal-ai/stable-audio-25/text-to-audio", "stable-audio-prompting"],
    ["stability-ai/stable-audio-2.5", "stable-audio-prompting"],
    ["fal-ai/stable-audio-3/medium/text-to-audio", "stable-audio-prompting"],
    // Direct-provider spellings of lines a manifest also serves.
    ["gemini-3-pro-image", "nano-banana-pro-prompting"],
    ["eleven_v3", "elevenlabs-audio-prompting"],
    ["eleven_multilingual_v2", "elevenlabs-audio-prompting"],
    ["eleven_turbo_v2_5", "elevenlabs-audio-prompting"],
    ["eleven_flash_v2_5", "elevenlabs-audio-prompting"],
    ["T2V-01-Director", "hailuo-prompting"],
    ["I2V-01-Director", "hailuo-prompting"],
    ["S2V-01", "hailuo-prompting"],
    ["MiniMax-Hailuo-02", "hailuo-prompting"],
    ["veo-3.1-generate-preview", "veo-3-prompting"],
    // kie spells H3 with a hyphen.
    ["minimax-h3/reference-to-video", "minimax-h3-prompting"],
    ["minimax/h3-fast/text-to-video", "minimax-h3-prompting"],
    // Wan2GP's local H3 checkpoints use an underscore.
    ["minimax_h3_fl2va_pruned", "minimax-h3-prompting"],
    ["minimax_h3_ref2va_pruned_pdd", "minimax-h3-prompting"],
    ["elevenlabs/v3", "elevenlabs-audio-prompting"],
    ["fal-ai/elevenlabs/music", "elevenlabs-audio-prompting"]
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
    // Local Wan 2.1/2.2 lacks the Wan 2.6 guide's shot controls.
    "ti2v_2_2_fastwan",
    "t2v",
    "i2v_2_2",
    "wan-video/wan-2.5-t2v",
    // A digit after h3 names another line, not Wan2GP's local H3.
    "minimax_h30",
    "alibaba/wan-2.7/text-to-video",
    // Kling before the shot list, and Kling Image, which is not the video line
    // at all.
    "fal-ai/kling-video/v1/standard/text-to-video",
    "fal-ai/kling-video/v2.1/pro/image-to-video",
    "kwaivgi/kling-v1.6-pro",
    "fal-ai/kling-image/v3/text-to-image",
    "fal-ai/kling-image/o3/image-to-image",
    "fal-ai/kling-video/lipsync/text-to-video",
    "bytedance/seedream-3",
    "fal-ai/bytedance/seedream/v3/text-to-image",
    // ElevenLabs endpoints that take no prompt.
    "fal-ai/elevenlabs/speech-to-text/scribe-v2",
    "fal-ai/elevenlabs/audio-isolation",
    "fal-ai/elevenlabs/dubbing",
    "elevenlabs/scribe-v2",
    // ElevenLabs releases the guide does not describe, and the direct v1.
    "elevenlabs/tts/eleven-v4",
    "elevenlabs/tts/eleven-v4-turbo",
    "elevenlabs/music/v2",
    "elevenlabs/music/v2.5",
    "eleven_monolingual_v1",
    // GPT Image 2.5, on every provider that serves it.
    "gpt-image-2-5-flare-text-to-image",
    "gpt-image-2-5-sunburst-image-to-image",
    "openai/gpt-image-2.5/flare/edit",
    "openai/gpt-image-2.5-sunburst/text-to-image",
    "gpt-image-2.5-flare",
    // Wan 2.6's image routes, which the video guide does not cover.
    "alibaba/wan-2.6/text-to-image",
    "alibaba/wan-2.6/image-edit",
    // The original Stable Audio.
    "fal-ai/stable-audio",
    // Trainers take a dataset, not a prompt.
    "fal-ai/flux-2-klein-4b-base-trainer",
    "fal-ai/flux-2-klein-9b-base-trainer/edit",
    "fal-ai/qwen-image-2512-trainer",
    "qwen/qwen-image-lora-trainer-legacy",
    "minimax/h3/t2v/trainer",
    "fal-ai/stable-audio-3-trainer",
    // Neighbours of the new direct spellings.
    "image-01",
    "tripo3d/h3.1/text-to-3d"
  ])("claims nothing for %s", (id) => {
    expect(promptingSkillFor(id)).toBeNull();
  });
});

describe("the shipped prompting skills", () => {
  const names = MODEL_PROMPTING_SKILLS.map((entry) => entry.skill);

  /**
   * None of these skills is featured, so the description surfaces only through
   * a `list_skills({query})` search — and an agent that finds a guide there
   * will pass the ids it names to `find_model`. Each id the description lists
   * must therefore be one a provider serves and one `find_model` would attach
   * this same guide to.
   */
  const servedIds = new Set([
    ...manifestModelIds(),
    ...Object.values(DIRECT_PROVIDER_IDS).flat().map((id) => id.toLowerCase())
  ]);
  /**
   * A listed id is served when it is a model id, the path prefix of one
   * (`minimax/h3-max` for `minimax/h3-max/*`), or kie's short form of one
   * (`seedance-2-fast` for `bytedance/seedance-2-fast`).
   */
  function isServed(token: string): boolean {
    if (servedIds.has(token)) return true;
    for (const id of servedIds) {
      if (id.startsWith(`${token}/`) || id.endsWith(`/${token}`)) return true;
    }
    return false;
  }

  it.each(names)("%s: every model id in its description is served and routes to it", (name) => {
    const parsed = parseSkillMarkdown(skillBody(name));
    expect(parsed, `${name} has unreadable frontmatter`).not.toBeNull();
    const description = parsed?.description ?? "";
    // The ids sit in the description's parenthesised lists. Inside those, an
    // id is a slash path or a hyphenated or underscored slug carrying a digit.
    const listed = [...description.matchAll(/\(([^)]*)\)/g)].flatMap((group) =>
      [...(group[1] ?? "").matchAll(/\b[a-z0-9]+(?:[/_-][a-z0-9.]+)+\b/g)]
        .map((match) => match[0])
        .filter((token) => token.includes("/") || /\d/.test(token))
    );
    expect(listed.length, `${name} names no model ids`).toBeGreaterThan(2);
    expect(
      listed.filter((id) => !isServed(id)),
      "named in this description, served by no provider"
    ).toEqual([]);
    expect(
      listed.filter((id) => promptingSkillFor(id) !== name),
      "named in this description, not routed to it"
    ).toEqual([]);
  });

  /**
   * Prose drifts where code cannot follow it: a capability gets renamed and
   * the skill keeps teaching the old spelling. Same protection the motion
   * skills get from shipped-skill-names.test.ts.
   */
  /**
   * Provider request fields a guide has to name that collide with a capability
   * prefix. `generate_audio` is Kling's own boolean, not a capability, and the
   * skill would be wrong to spell it any other way.
   */
  const PROVIDER_PARAMETER_NAMES = new Set(["generate_audio"]);

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
        if (
          prefixes.some((prefix) => token.startsWith(prefix)) &&
          !PROVIDER_PARAMETER_NAMES.has(token)
        ) {
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
  protected override declaredCapabilities() {
    return ["text_to_image", "image_to_image"] as const;
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
