import { describe, expect, it } from "vitest";

import {
  readWorkflowSetup,
  workflowSetup,
  workflowSettingsWithSetup,
  writeWorkflowSetup
} from "../src/api-schemas/workflows.js";

describe("workflow settings.setup", () => {
  it("parses a settings bag that has no setup — the workflows built before the flow", () => {
    const parsed = workflowSettingsWithSetup.safeParse({ hide_ui: false });
    expect(parsed.success).toBe(true);
    expect(readWorkflowSetup({ hide_ui: false })).toBeNull();
  });

  it("parses null and undefined settings as no setup", () => {
    expect(readWorkflowSetup(null)).toBeNull();
    expect(readWorkflowSetup(undefined)).toBeNull();
  });

  it("keeps every other settings key when setup is written", () => {
    const settings = writeWorkflowSetup(
      { hide_ui: true, someone_elses: { a: 1 } },
      { brief: "Summarize a PDF and email it", stage: "category" }
    );
    expect(settings["hide_ui"]).toBe(true);
    expect(settings["someone_elses"]).toEqual({ a: 1 });
    expect(readWorkflowSetup(settings)).toMatchObject({
      brief: "Summarize a PDF and email it",
      stage: "category"
    });
  });

  it("merges into the setup already there rather than replacing it", () => {
    const first = writeWorkflowSetup({}, { brief: "b", stage: "category" });
    const second = writeWorkflowSetup(first, { category: "content-pipeline" });
    expect(readWorkflowSetup(second)).toMatchObject({
      brief: "b",
      stage: "category",
      category: "content-pipeline"
    });
  });

  it("defaults a bare setup to stage done, so a legacy value opens the editor", () => {
    expect(workflowSetup.parse({}).stage).toBe("done");
  });

  it("keeps a step's null node_type — an unnamed step is a real plan state", () => {
    const setup = workflowSetup.parse({
      stage: "review",
      brief: "b",
      plan: {
        inputs: [{ name: "url", type: "string", sample: "https://x" }],
        steps: [
          { id: "s1", title: "Fetch", summary: "get it", node_type: null }
        ],
        outputs: [{ name: "post", type: "string" }]
      }
    });
    expect(setup.plan?.steps[0].node_type).toBeNull();
  });

  it("refuses an unknown stage", () => {
    expect(workflowSetup.safeParse({ stage: "look" }).success).toBe(false);
  });
});

describe("writeWorkflowSetup keeps the rest of the bag", () => {
  // The bag is client-owned and holds more than `setup`. A `setup` this build
  // cannot parse — a stage a newer client or an agent wrote — must not cost the
  // caller every sibling setting on the next write.
  it("preserves sibling settings when the stored setup does not parse", () => {
    const written = writeWorkflowSetup(
      { hide_ui: true, setup: { stage: "planning" } },
      { stage: "review" }
    );

    expect(written["hide_ui"]).toBe(true);
    expect(written["setup"]).toMatchObject({ stage: "review" });
  });

  it("preserves sibling settings when the stored setup parses", () => {
    const written = writeWorkflowSetup(
      { hide_ui: true, setup: { stage: "idea", brief: "a thing" } },
      { stage: "category" }
    );

    expect(written["hide_ui"]).toBe(true);
    expect(written["setup"]).toMatchObject({
      stage: "category",
      brief: "a thing"
    });
  });
});
