/**
 * What the model reads carries short resource ids; what it never needed
 * (`user_id`) is gone; and nothing that merely looks like an id is touched.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { Workflow, initTestDb } from "@nodetool-ai/models";
import {
  sandboxCapabilitySpecifier,
  shortResourceId
} from "@nodetool-ai/protocol";
import {
  compactAssetUris,
  compactResourceIds
} from "../src/codeact/compact-ids.js";
import { createCapabilityDispatcher } from "../src/capabilities/dispatcher.js";
import { UNGATED, createCapabilityRun } from "../src/capabilities/index.js";

const FULL = "0192a7f3c4e5b6d7a8f9e0c1b2d3e4f5";
const SHORT = FULL.slice(0, 12);

describe("compactResourceIds", () => {
  it("shortens ids in id-named fields, nested and in lists", () => {
    const out = compactResourceIds({
      id: FULL,
      workflow_id: FULL,
      asset_ids: [FULL, "not-an-id"],
      nested: [{ job_id: FULL }],
      uri: `asset://${FULL}.png`,
      uris: [`asset://${FULL}`]
    });
    expect(out).toEqual({
      id: SHORT,
      workflow_id: SHORT,
      asset_ids: [SHORT, "not-an-id"],
      nested: [{ job_id: SHORT }],
      uri: `asset://${SHORT}.png`,
      uris: [`asset://${SHORT}`]
    });
  });

  it("drops user_id and leaves 32-hex values outside id fields alone", () => {
    const etag = "9e107d9d372bb6826bd81d3542a419d6";
    const out = compactResourceIds({
      user_id: FULL,
      etag,
      content: FULL,
      source: FULL
    });
    expect(out).toEqual({ etag, content: FULL, source: FULL });
  });

  it("leaves values that are not a full id alone", () => {
    const out = compactResourceIds({
      id: "example/hello",
      _tool_call_id: "codeact_3",
      thread_id: null,
      uri: "https://example.com/x.png"
    });
    expect(out).toEqual({
      id: "example/hello",
      _tool_call_id: "codeact_3",
      thread_id: null,
      uri: "https://example.com/x.png"
    });
  });

  it("rewrites only asset:// uris in free text", () => {
    const text = `clip: asset://${FULL}.mp4 hash ${FULL} also asset://${FULL}`;
    expect(compactAssetUris(text)).toBe(
      `clip: asset://${SHORT}.mp4 hash ${FULL} also asset://${SHORT}`
    );
  });
});

describe("a capability round trip", () => {
  const USER = "user-short-id";
  const ctx = { userId: USER } as unknown as ProcessingContext;
  const WORKFLOWS = sandboxCapabilitySpecifier("workflows");

  beforeEach(() => {
    initTestDb();
  });

  it("lists short ids and resolves one back to the same row", async () => {
    const created = await Workflow.create<Workflow>({
      user_id: USER,
      name: "round trip",
      graph: { nodes: [], edges: [] }
    });
    const run = createCapabilityRun({ context: ctx, gate: UNGATED });
    const dispatcher = createCapabilityDispatcher(run, ["workflows"]);

    const listed = (await dispatcher.call(WORKFLOWS, "list_workflows", [
      {}
    ])) as { workflows: Array<{ id: string; user_id?: string }> };
    const row = listed.workflows.find(
      (entry) => entry.id === shortResourceId(created.id)
    );
    expect(row).toBeDefined();
    expect(row).not.toHaveProperty("user_id");

    const fetched = (await dispatcher.call(WORKFLOWS, "get_workflow", [
      { workflow_id: row!.id }
    ])) as { id: string; name: string };
    expect(fetched.name).toBe("round trip");
    expect(fetched.id).toBe(shortResourceId(created.id));
  });
});
