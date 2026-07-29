import { describe, it, expect } from "vitest";
import {
  storageEntrySchema,
  listStorageInput,
  listStorageOutput,
  storageMetadataInput,
  storageMetadataOutput,
  signUrlInput,
  signUrlOutput,
  storageDeleteInput,
  storageDeleteOutput
} from "../src/api-schemas/storage.js";

const validEntry = {
  key: "a/b.png",
  size: 100,
  content_type: "image/png",
  last_modified: "2026-01-01"
};

describe("storage.storageEntrySchema", () => {
  it("parses a valid entry", () => {
    expect(storageEntrySchema.safeParse(validEntry).success).toBe(true);
  });

  it("rejects a non-number size", () => {
    expect(
      storageEntrySchema.safeParse({ ...validEntry, size: "100" }).success
    ).toBe(false);
  });

  it("rejects a missing content_type", () => {
    const { content_type, ...rest } = validEntry;
    expect(storageEntrySchema.safeParse(rest).success).toBe(false);
  });
});

describe("storage.listStorageInput", () => {
  it("accepts an empty object (prefix optional)", () => {
    expect(listStorageInput.safeParse({}).success).toBe(true);
  });

  it("accepts a prefix string", () => {
    expect(listStorageInput.safeParse({ prefix: "img/" }).success).toBe(true);
  });

  it("rejects a non-string prefix", () => {
    expect(listStorageInput.safeParse({ prefix: 5 }).success).toBe(false);
  });
});

describe("storage.listStorageOutput", () => {
  it("parses entries + count", () => {
    expect(
      listStorageOutput.safeParse({ entries: [validEntry], count: 1 }).success
    ).toBe(true);
  });
});

describe("storage.storageMetadataInput / signUrlInput / storageDeleteInput", () => {
  it("accept a non-empty key", () => {
    expect(storageMetadataInput.safeParse({ key: "k" }).success).toBe(true);
    expect(signUrlInput.safeParse({ key: "k" }).success).toBe(true);
    expect(storageDeleteInput.safeParse({ key: "k" }).success).toBe(true);
  });

  it("reject an empty key", () => {
    expect(storageMetadataInput.safeParse({ key: "" }).success).toBe(false);
    expect(signUrlInput.safeParse({ key: "" }).success).toBe(false);
    expect(storageDeleteInput.safeParse({ key: "" }).success).toBe(false);
  });
});

describe("storage.storageMetadataOutput", () => {
  it("mirrors storageEntrySchema", () => {
    expect(storageMetadataOutput.safeParse(validEntry).success).toBe(true);
    expect(storageMetadataOutput.safeParse({}).success).toBe(false);
  });
});

describe("storage.signUrlOutput", () => {
  it("requires a url string", () => {
    expect(signUrlOutput.safeParse({ url: "http://x" }).success).toBe(true);
    expect(signUrlOutput.safeParse({}).success).toBe(false);
  });
});

describe("storage.storageDeleteOutput", () => {
  it("requires ok: true literal", () => {
    expect(storageDeleteOutput.safeParse({ ok: true }).success).toBe(true);
    expect(storageDeleteOutput.safeParse({ ok: false }).success).toBe(false);
  });
});
