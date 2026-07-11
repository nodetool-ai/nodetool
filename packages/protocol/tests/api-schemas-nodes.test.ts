import { describe, it, expect } from "vitest";
import {
  replicateStatusOutput,
  validateUsernameInput,
  validateUsernameOutput,
  dummyOutput,
  nodeMetadataSchema,
  nodeMetadataSummary,
  listInput,
  listOutput,
  getInput
} from "../src/api-schemas/nodes.js";

describe("nodes.replicateStatusOutput", () => {
  it("requires a boolean configured flag", () => {
    expect(replicateStatusOutput.safeParse({ configured: true }).success).toBe(
      true
    );
    expect(replicateStatusOutput.safeParse({ configured: "yes" }).success).toBe(
      false
    );
  });
});

describe("nodes.validateUsernameInput", () => {
  it("rejects username shorter than 3 chars", () => {
    expect(validateUsernameInput.safeParse({ username: "ab" }).success).toBe(
      false
    );
  });

  it("accepts a 3-char username (min boundary)", () => {
    expect(validateUsernameInput.safeParse({ username: "abc" }).success).toBe(
      true
    );
  });

  it("accepts a 32-char username (max boundary)", () => {
    expect(
      validateUsernameInput.safeParse({ username: "a".repeat(32) }).success
    ).toBe(true);
  });

  it("rejects a 33-char username (over max)", () => {
    expect(
      validateUsernameInput.safeParse({ username: "a".repeat(33) }).success
    ).toBe(false);
  });
});

describe("nodes.validateUsernameOutput", () => {
  it("requires valid and available booleans", () => {
    expect(
      validateUsernameOutput.safeParse({ valid: true, available: false })
        .success
    ).toBe(true);
    expect(validateUsernameOutput.safeParse({ valid: true }).success).toBe(
      false
    );
  });
});

describe("nodes.dummyOutput", () => {
  it("accepts nullable asset_id/data/metadata", () => {
    const result = dummyOutput.safeParse({
      type: "image",
      uri: "u",
      asset_id: null,
      data: null,
      metadata: null
    });
    expect(result.success).toBe(true);
  });

  it("rejects when asset_id is undefined (nullable, not optional)", () => {
    const result = dummyOutput.safeParse({
      type: "image",
      uri: "u",
      data: null,
      metadata: null
    });
    expect(result.success).toBe(false);
  });
});

describe("nodes.nodeMetadataSchema", () => {
  it("accepts base fields and passes through extras", () => {
    const parsed = nodeMetadataSchema.parse({
      node_type: "nodetool.text.Concat",
      title: "Concat",
      description: "d",
      namespace: "nodetool.text",
      properties: [{ name: "a" }]
    });
    expect(parsed).toHaveProperty("properties");
  });

  it("rejects missing node_type", () => {
    const result = nodeMetadataSchema.safeParse({
      title: "t",
      description: "d",
      namespace: "n"
    });
    expect(result.success).toBe(false);
  });
});

describe("nodes.nodeMetadataSummary", () => {
  it("strips extra fields (non-passthrough)", () => {
    const parsed = nodeMetadataSummary.parse({
      node_type: "t",
      title: "t",
      description: "d",
      namespace: "n",
      extra: "gone"
    });
    expect(parsed).not.toHaveProperty("extra");
  });
});

describe("nodes.listInput", () => {
  it("defaults fields to summary", () => {
    expect(listInput.parse({}).fields).toBe("summary");
  });

  it("rejects an invalid fields enum value", () => {
    expect(listInput.safeParse({ fields: "detailed" }).success).toBe(false);
  });

  it("rejects a non-integer limit", () => {
    expect(listInput.safeParse({ limit: 1.5 }).success).toBe(false);
  });

  it("rejects limit below 1", () => {
    expect(listInput.safeParse({ limit: 0 }).success).toBe(false);
  });

  it("rejects limit above 10000", () => {
    expect(listInput.safeParse({ limit: 10001 }).success).toBe(false);
  });

  it("accepts limit at max boundary 10000", () => {
    expect(listInput.safeParse({ limit: 10000 }).success).toBe(true);
  });
});

describe("nodes.listOutput", () => {
  it("wraps an array of node metadata", () => {
    const result = listOutput.safeParse({
      nodes: [
        { node_type: "t", title: "t", description: "d", namespace: "n" }
      ]
    });
    expect(result.success).toBe(true);
  });
});

describe("nodes.getInput", () => {
  it("rejects empty node_type", () => {
    expect(getInput.safeParse({ node_type: "" }).success).toBe(false);
  });
});
