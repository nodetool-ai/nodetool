import { describe, it, expect } from "vitest";
import {
  settingWithValue,
  secretResponse,
  listOutput,
  updateInput,
  updateOutput,
  secretsListOutput,
  secretGetInput,
  secretUpsertInput,
  secretDeleteInput
} from "../src/api-schemas/settings.js";

describe("settings.settingWithValue", () => {
  it("accepts a fully populated setting with null enum and unknown value", () => {
    const result = settingWithValue.safeParse({
      package_name: "core",
      env_var: "OPENAI_API_KEY",
      group: "providers",
      description: "d",
      enum: null,
      value: "****",
      is_secret: true
    });
    expect(result.success).toBe(true);
  });

  it("accepts an enum array of strings", () => {
    const result = settingWithValue.safeParse({
      package_name: "core",
      env_var: "LOG",
      group: "g",
      description: "d",
      enum: ["debug", "info"],
      value: null,
      is_secret: false
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing is_secret flag", () => {
    const result = settingWithValue.safeParse({
      package_name: "core",
      env_var: "X",
      group: "g",
      description: "d",
      enum: null,
      value: 1
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-null non-array enum", () => {
    const result = settingWithValue.safeParse({
      package_name: "core",
      env_var: "X",
      group: "g",
      description: "d",
      enum: "notarray",
      value: 1,
      is_secret: false
    });
    expect(result.success).toBe(false);
  });
});

describe("settings.secretResponse", () => {
  it("accepts the minimal placeholder shape (key + is_configured)", () => {
    const result = secretResponse.safeParse({
      key: "OPENAI_API_KEY",
      is_configured: false
    });
    expect(result.success).toBe(true);
  });

  it("accepts an optional value when decrypted", () => {
    const result = secretResponse.safeParse({
      key: "OPENAI_API_KEY",
      is_configured: true,
      value: "sk-123"
    });
    expect(result.success).toBe(true);
  });

  it("rejects when is_configured is missing", () => {
    expect(secretResponse.safeParse({ key: "X" }).success).toBe(false);
  });
});

describe("settings.listOutput", () => {
  it("wraps an array of settings", () => {
    const result = listOutput.safeParse({ settings: [] });
    expect(result.success).toBe(true);
  });
});

describe("settings.updateInput", () => {
  it("accepts an empty object (both optional)", () => {
    expect(updateInput.safeParse({}).success).toBe(true);
  });

  it("accepts settings and secrets records", () => {
    const result = updateInput.safeParse({
      settings: { LOG: "debug" },
      secrets: { KEY: "v" }
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-record settings value", () => {
    expect(updateInput.safeParse({ settings: "bad" }).success).toBe(false);
  });
});

describe("settings.updateOutput", () => {
  it("requires a message string", () => {
    expect(updateOutput.safeParse({ message: "ok" }).success).toBe(true);
    expect(updateOutput.safeParse({}).success).toBe(false);
  });
});

describe("settings.secretsListOutput", () => {
  it("accepts null next_key", () => {
    const result = secretsListOutput.safeParse({
      secrets: [],
      next_key: null
    });
    expect(result.success).toBe(true);
  });

  it("rejects when next_key is omitted (nullable, not optional)", () => {
    expect(secretsListOutput.safeParse({ secrets: [] }).success).toBe(false);
  });
});

describe("settings.secretGetInput", () => {
  it("defaults decrypt to false", () => {
    expect(secretGetInput.parse({ key: "K" }).decrypt).toBe(false);
  });

  it("rejects an empty key", () => {
    expect(secretGetInput.safeParse({ key: "" }).success).toBe(false);
  });
});

describe("settings.secretUpsertInput", () => {
  it("requires key and value", () => {
    expect(
      secretUpsertInput.safeParse({ key: "K", value: "v" }).success
    ).toBe(true);
    expect(secretUpsertInput.safeParse({ key: "K" }).success).toBe(false);
  });

  it("rejects empty key", () => {
    expect(
      secretUpsertInput.safeParse({ key: "", value: "v" }).success
    ).toBe(false);
  });
});

describe("settings.secretDeleteInput", () => {
  it("rejects empty key", () => {
    expect(secretDeleteInput.safeParse({ key: "" }).success).toBe(false);
  });
});
