/**
 * Tests for the timeline template seed — NOD-300.
 *
 * Validates:
 * 1. Seed runs cleanly on a fresh DB and produces three workflows.
 * 2. Re-running the seed updates rather than duplicates.
 * 3. Each seeded workflow has the expected shape (tags, access, graph nodes).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { initTestDb } from "../src/db.js";
import { Workflow } from "../src/workflow.js";
import {
  runSeeds,
  seedTimelineTemplates,
  SEED_IDS,
  SYSTEM_USER_ID,
  TIMELINE_TEMPLATE_TAG
} from "../src/seeds/index.js";

function setup(): void {
  initTestDb();
}

describe("Timeline template seeds", () => {
  beforeEach(setup);

  it("produces exactly three workflow rows on a fresh DB", async () => {
    await runSeeds();
    const [all] = await Workflow.paginate(SYSTEM_USER_ID);
    const templates = all.filter(
      (w: Workflow) => Array.isArray(w.tags) && w.tags.includes(TIMELINE_TEMPLATE_TAG)
    );
    expect(templates).toHaveLength(3);
  });

  it("creates workflows with deterministic IDs", async () => {
    await runSeeds();
    const tti = await Workflow.get(SEED_IDS.textToImage);
    const i2v = await Workflow.get(SEED_IDS.imageToVideo);
    const tts = await Workflow.get(SEED_IDS.textToSpeech);

    expect(tti).not.toBeNull();
    expect(i2v).not.toBeNull();
    expect(tts).not.toBeNull();
  });

  it("sets access=public and tags include timeline-template", async () => {
    await runSeeds();

    for (const id of Object.values(SEED_IDS)) {
      const wf = await Workflow.get(id) as Workflow;
      expect(wf).not.toBeNull();
      expect(wf.access).toBe("public");
      expect(wf.run_mode).toBe("workflow");
      expect(wf.user_id).toBe(SYSTEM_USER_ID);
      expect(Array.isArray(wf.tags)).toBe(true);
      expect(wf.tags).toContain(TIMELINE_TEMPLATE_TAG);
      expect(typeof wf.description).toBe("string");
      expect(wf.description.length).toBeGreaterThan(0);
    }
  });

  it("is idempotent — re-running seed does not duplicate rows", async () => {
    await runSeeds();
    await runSeeds(); // second run

    const [all] = await Workflow.paginate(SYSTEM_USER_ID);
    const templates = all.filter(
      (w: Workflow) => Array.isArray(w.tags) && w.tags.includes(TIMELINE_TEMPLATE_TAG)
    );
    expect(templates).toHaveLength(3);
  });

  it("Text-to-Image graph exposes prompt and model inputs", async () => {
    await seedTimelineTemplates();
    const wf = await Workflow.get(SEED_IDS.textToImage) as Workflow;
    expect(wf).not.toBeNull();

    const { nodes, edges } = wf.graph as { nodes: Record<string, unknown>[]; edges: Record<string, unknown>[] };
    expect(Array.isArray(nodes)).toBe(true);
    expect(Array.isArray(edges)).toBe(true);

    const types = nodes.map((n) => n.type as string);
    expect(types).toContain("nodetool.input.StringInput");
    expect(types).toContain("nodetool.input.ImageModelInput");
    expect(types).toContain("nodetool.image.TextToImage");
    expect(types).toContain("nodetool.output.Output");

    // Edges connect inputs to the generation node
    expect(edges.length).toBeGreaterThan(0);
  });

  it("Image-to-Video graph exposes source_image and duration inputs", async () => {
    await seedTimelineTemplates();
    const wf = await Workflow.get(SEED_IDS.imageToVideo) as Workflow;
    expect(wf).not.toBeNull();

    const { nodes, edges } = wf.graph as { nodes: Record<string, unknown>[]; edges: Record<string, unknown>[] };
    const types = nodes.map((n) => n.type as string);
    expect(types).toContain("nodetool.input.ImageInput");
    expect(types).toContain("nodetool.input.IntegerInput");
    expect(types).toContain("nodetool.video.ImageToVideo");
    expect(types).toContain("nodetool.output.Output");

    expect(edges.length).toBeGreaterThan(0);
  });

  it("Text-to-Speech graph exposes text and voice inputs", async () => {
    await seedTimelineTemplates();
    const wf = await Workflow.get(SEED_IDS.textToSpeech) as Workflow;
    expect(wf).not.toBeNull();

    const { nodes, edges } = wf.graph as { nodes: Record<string, unknown>[]; edges: Record<string, unknown>[] };
    const types = nodes.map((n) => n.type as string);
    expect(types).toContain("nodetool.input.StringInput");
    expect(types).toContain("nodetool.input.SelectInput");
    expect(types).toContain("openai.audio.TextToSpeech");
    expect(types).toContain("nodetool.output.Output");

    expect(edges.length).toBeGreaterThan(0);
  });

  it("each workflow graph has nodes with required fields", async () => {
    await seedTimelineTemplates();

    for (const id of Object.values(SEED_IDS)) {
      const wf = await Workflow.get(id) as Workflow;
      const { nodes } = wf.graph as { nodes: Record<string, unknown>[] };

      for (const n of nodes) {
        expect(typeof n.id).toBe("string");
        expect(typeof n.type).toBe("string");
        expect(n.data !== undefined && n.data !== null).toBe(true);
      }
    }
  });
});
