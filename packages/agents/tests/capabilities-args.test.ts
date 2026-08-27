import { describe, expect, it } from "vitest";
import type { JsonSchema } from "@nodetool-ai/runtime";

import {
  coerceCapabilityArgs,
  withSnakeCaseAliases
} from "../src/capabilities/args.js";

const SAVE_ASSET = {
  name: "save_asset",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string" },
      source: { type: "string" },
      content_type: { type: "string" }
    },
    required: ["name"]
  } as JsonSchema
};

const GET_SCHEMA = {
  name: "get_apify_actor_schema",
  inputSchema: {
    type: "object",
    properties: { actor_id: { type: "string" } },
    required: ["actor_id"]
  } as JsonSchema
};

const GET_WORKFLOW = {
  name: "get_workflow",
  inputSchema: {
    type: "object",
    properties: { workflow_id: { type: "string" } },
    required: ["workflow_id"]
  } as JsonSchema
};

const TWO_IDS = {
  name: "two_ids",
  inputSchema: {
    type: "object",
    properties: {
      workflow_id: { type: "string" },
      job_id: { type: "string" }
    },
    required: ["workflow_id", "job_id"]
  } as JsonSchema
};

describe("withSnakeCaseAliases", () => {
  it("copies actorId onto actor_id when actor_id is absent", () => {
    expect(withSnakeCaseAliases({ actorId: "apify/instagram-scraper" })).toEqual({
      actorId: "apify/instagram-scraper",
      actor_id: "apify/instagram-scraper"
    });
  });

  it("does not overwrite an existing snake_case key", () => {
    expect(
      withSnakeCaseAliases({ actor_id: "kept", actorId: "ignored" })
    ).toEqual({ actor_id: "kept", actorId: "ignored" });
  });

  it("does not rewrite keys inside nested records", () => {
    const input = { waitForFinish: false };
    expect(withSnakeCaseAliases({ input, waitForFinish: false })).toEqual({
      input,
      waitForFinish: false,
      wait_for_finish: false
    });
    expect(input).toEqual({ waitForFinish: false });
  });
});

describe("coerceCapabilityArgs", () => {
  it("passes a single record through with snake_case aliases", () => {
    expect(
      coerceCapabilityArgs(GET_SCHEMA, [
        { actorId: "apify/instagram-reel-scraper" }
      ])
    ).toEqual({
      actorId: "apify/instagram-reel-scraper",
      actor_id: "apify/instagram-reel-scraper"
    });
  });

  it("treats a lone string as the first required string field", () => {
    expect(
      coerceCapabilityArgs(GET_SCHEMA, ["apify/instagram-reel-scraper"])
    ).toEqual({ actor_id: "apify/instagram-reel-scraper" });
  });

  it("folds save_asset(name, { source }) into one record", () => {
    expect(
      coerceCapabilityArgs(SAVE_ASSET, [
        "National Geographic Giraffe Reel",
        { source: "https://example.com/reel.mp4", contentType: "video/mp4" }
      ])
    ).toEqual({
      name: "National Geographic Giraffe Reel",
      source: "https://example.com/reel.mp4",
      contentType: "video/mp4",
      content_type: "video/mp4"
    });
  });

  it("returns {} for a missing or undefined first argument", () => {
    expect(coerceCapabilityArgs(SAVE_ASSET, [])).toEqual({});
    expect(coerceCapabilityArgs(SAVE_ASSET, [undefined])).toEqual({});
  });

  it("names the required fields when the call is not one object", () => {
    expect(() => coerceCapabilityArgs(SAVE_ASSET, [1])).toThrow(
      /save_asset takes one arguments object \(\{ name \}\)/
    );
  });
});

describe("coerceCapabilityArgs argument checking", () => {
  // `get_workflow({ id })` reached the implementation as `workflow_id:
  // undefined` and came back "Workflow undefined was not found" — a report
  // about a missing workflow for what was a misspelled argument.
  it("copies a bare id onto the one required *_id key", () => {
    expect(coerceCapabilityArgs(GET_WORKFLOW, [{ id: "wf-1" }])).toEqual({
      id: "wf-1",
      workflow_id: "wf-1"
    });
  });

  it("leaves an explicit workflow_id alone", () => {
    expect(
      coerceCapabilityArgs(GET_WORKFLOW, [{ id: "ignored", workflow_id: "kept" }])
    ).toEqual({ id: "ignored", workflow_id: "kept" });
  });

  it("does not guess when two *_id keys are required", () => {
    expect(() =>
      coerceCapabilityArgs(TWO_IDS, [{ id: "x" }])
    ).toThrow(/two_ids: missing required arguments workflow_id, job_id/);
  });

  it("names the call, the missing key, and what was passed instead", () => {
    expect(() =>
      coerceCapabilityArgs(SAVE_ASSET, [{ source: "https://example.com/a.mp4" }])
    ).toThrow(/save_asset: missing required argument name\. Got: source\./);
  });

  it("treats an explicit null as missing", () => {
    expect(() =>
      coerceCapabilityArgs(SAVE_ASSET, [{ name: null, source: "s" }])
    ).toThrow(/save_asset: missing required argument name/);
  });

  it("says a required key was passed empty rather than reading as self-contradictory", () => {
    expect(() =>
      coerceCapabilityArgs(SAVE_ASSET, [{ name: undefined, source: "s" }])
    ).toThrow(
      /Got: name, source\. name was passed as null\/undefined — the key is right, the value is missing\./
    );
  });

  it("says nothing about empty values when the key is simply absent", () => {
    expect(() =>
      coerceCapabilityArgs(SAVE_ASSET, [{ source: "s" }])
    ).toThrow(/save_asset: missing required argument name\. Got: source\.$/);
  });

  it("leaves a call with no arguments to the implementation", () => {
    expect(coerceCapabilityArgs(SAVE_ASSET, [])).toEqual({});
  });

  it("accepts a camelCase key that aliases onto the required one", () => {
    expect(coerceCapabilityArgs(GET_SCHEMA, [{ actorId: "a/b" }])).toEqual({
      actorId: "a/b",
      actor_id: "a/b"
    });
  });
});

describe("every capability spec", () => {
  it("requires only keys it declares as properties", async () => {
    const { listCapabilitySpecs } = await import(
      "../src/capabilities/registry.js"
    );
    const undeclared: string[] = [];
    for (const spec of listCapabilitySpecs()) {
      const required = spec.inputSchema.required;
      if (!Array.isArray(required)) continue;
      const properties = spec.inputSchema.properties ?? {};
      for (const key of required) {
        if (typeof key === "string" && !(key in properties)) {
          undeclared.push(`${spec.name}.${key}`);
        }
      }
    }
    // A required key with no property is a spec the argument check would
    // reject calls against and no caller could satisfy from the schema alone.
    expect(undeclared).toEqual([]);
  });

  it("does not require a key it also gives a default", async () => {
    const { listCapabilitySpecs } = await import(
      "../src/capabilities/registry.js"
    );
    const contradictory: string[] = [];
    for (const spec of listCapabilitySpecs()) {
      const required = spec.inputSchema.required;
      if (!Array.isArray(required)) continue;
      const properties = (spec.inputSchema.properties ?? {}) as Record<
        string,
        { default?: unknown }
      >;
      for (const key of required) {
        if (typeof key !== "string") continue;
        if (properties[key]?.default !== undefined) {
          contradictory.push(`${spec.name}.${key}`);
        }
      }
    }
    // A default says "omitting this is fine"; `required` says it is not. The
    // argument check believes `required`, so a spec saying both would start
    // refusing calls that used to work.
    expect(contradictory).toEqual([]);
  });
});
