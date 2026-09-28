import { describe, expect, it } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { createCapabilityRun, UNGATED } from "../src/capabilities/index.js";
import { capabilitySpec } from "../src/capabilities/registry.js";
import { BUILTIN_TOOL_NAMES } from "../src/tools/builtin-tools.js";

const run = () =>
  createCapabilityRun({
    // These shipped references must work without a user, database or repository workspace.
    context: {} as unknown as ProcessingContext,
    gate: UNGATED
  });

describe("shipped example timeline agent access", () => {
  it("exposes read-only example tools on the agent belt", () => {
    for (const name of ["list_example_timelines", "get_example_timeline"]) {
      expect(capabilitySpec(name)?.category).toBe("read");
      expect(BUILTIN_TOOL_NAMES).toContain(name);
    }
  });

  it("lets a userless session study a scene returned by the example catalog", async () => {
    const catalog = await run().invoke("list_example_timelines", {});
    expect(catalog).toMatchObject({
      examples: expect.arrayContaining([
        expect.objectContaining({
          slug: "kite",
          source: "shipped",
          read_only: true,
          poster_uri: expect.stringMatching(/^package:\/\//),
          stats: expect.objectContaining({ groups: expect.any(Number) })
        })
      ])
    });
    const example = await run().invoke("get_example_timeline", {
      slug: "kite",
      clip_limit: 2
    });
    expect(example).toMatchObject({
      slug: "kite",
      scenes: expect.any(Array),
      excerpt: {
        clips: expect.any(Array),
        total_clips: expect.any(Number),
        truncated: true,
        next_clip_offset: 2
      }
    });
  });
});

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Expected object");
  return value;
}

function records(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error("Expected array");
  return value.map(record);
}

describe("example scene boundaries", () => {
  it("round-trips scene ids and clip offsets while retaining authored curves", async () => {
    const first = record(
      await run().invoke("get_example_timeline", { slug: "kite" })
    );
    const scenes = records(first["scenes"]);
    expect(scenes.length).toBeGreaterThan(0);
    const sceneId = scenes[0]?.["id"];
    expect(typeof sceneId).toBe("string");
    const seen = new Set<string>();
    let offset: unknown = 0;
    let total = 0;
    let custom = 0;
    for (let page = 0; page < 100; page += 1) {
      const result = record(
        await run().invoke("get_example_timeline", {
          slug: "kite",
          scene_id: sceneId,
          clip_offset: offset,
          clip_limit: 3
        })
      );
      const excerpt = record(result["excerpt"]);
      expect(excerpt["scene_id"]).toBe(sceneId);
      const clips = records(excerpt["clips"]);
      expect(clips.length).toBeLessThanOrEqual(3);
      expect(JSON.stringify(clips).length).toBeLessThan(12100);
      expect(excerpt["omitted_clip_ids"]).toEqual([]);
      for (const clip of clips) {
        expect(typeof clip["id"]).toBe("string");
        const id = String(clip["id"]);
        expect(seen.has(id)).toBe(false);
        seen.add(id);
        for (const animation of records(clip["animations"] ?? [])) {
          if (animation["preset"] === "custom") custom += 1;
        }
      }
      total = Number(excerpt["total_clips"]);
      offset = excerpt["next_clip_offset"];
      if (offset === null) {
        expect(excerpt["truncated"]).toBe(false);
        break;
      }
    }
    expect(seen.size).toBe(total);
    expect(custom).toBeGreaterThan(0);
    expect(seen.has(String(sceneId))).toBe(true);
  });

  it("rejects paths, short slugs, unknown scenes and invalid pagination", async () => {
    for (const slug of ["../kite", "ki", "kite.timeline.json"]) {
      expect(
        await run().invoke("get_example_timeline", { slug })
      ).toMatchObject({ error: expect.any(String) });
    }
    for (const opts of [
      { scene_id: "no-such-scene" },
      { clip_offset: -1 },
      { clip_limit: 41 },
      { clip_limit: 1.5 }
    ]) {
      expect(
        await run().invoke("get_example_timeline", { slug: "kite", ...opts })
      ).toMatchObject({ error: expect.any(String) });
    }
  });

  it("returns structural data for every shipped reference within the tool result budget", async () => {
    const catalog = record(await run().invoke("list_example_timelines", {}));
    const examples = records(catalog["examples"]);
    expect(examples.length).toBeGreaterThan(0);
    for (const example of examples) {
      const result = record(
        await run().invoke("get_example_timeline", {
          slug: example["slug"],
          clip_limit: 40
        })
      );
      expect(result).not.toHaveProperty("error");
      expect(JSON.stringify(result).length).toBeLessThan(25000);
      expect(record(result["stats"])["clips"]).toBeGreaterThan(0);
    }
    expect(
      await run().invoke("list_example_timelines", { query: "no-such-example" })
    ).toMatchObject({ examples: [], count: 0 });
  });
});
