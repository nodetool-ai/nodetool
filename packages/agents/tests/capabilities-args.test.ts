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
