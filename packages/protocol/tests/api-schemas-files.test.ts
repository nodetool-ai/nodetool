import { describe, it, expect } from "vitest";
import {
  fileEntrySchema,
  listFilesInput,
  listFilesOutput,
  fileInfoInput,
  fileInfoOutput
} from "../src/api-schemas/files.js";

const validEntry = {
  name: "a.txt",
  path: "/home/a.txt",
  size: 12,
  is_dir: false,
  modified_at: "2026-01-01T00:00:00Z"
};

describe("files.fileEntrySchema", () => {
  it("parses a valid entry", () => {
    expect(fileEntrySchema.safeParse(validEntry).success).toBe(true);
  });

  it("rejects a non-boolean is_dir", () => {
    expect(
      fileEntrySchema.safeParse({ ...validEntry, is_dir: "false" }).success
    ).toBe(false);
  });

  it("rejects a missing path", () => {
    const { path, ...rest } = validEntry;
    expect(fileEntrySchema.safeParse(rest).success).toBe(false);
  });

  it("rejects a non-number size", () => {
    expect(
      fileEntrySchema.safeParse({ ...validEntry, size: "12" }).success
    ).toBe(false);
  });
});

describe("files.listFilesInput / fileInfoInput", () => {
  it("accepts a non-empty path", () => {
    expect(listFilesInput.safeParse({ path: "/x" }).success).toBe(true);
    expect(fileInfoInput.safeParse({ path: "/x" }).success).toBe(true);
  });

  it("rejects an empty path", () => {
    expect(listFilesInput.safeParse({ path: "" }).success).toBe(false);
    expect(fileInfoInput.safeParse({ path: "" }).success).toBe(false);
  });
});

describe("files.listFilesOutput", () => {
  it("parses an array of entries", () => {
    expect(listFilesOutput.safeParse([validEntry, validEntry]).success).toBe(
      true
    );
  });

  it("parses an empty array", () => {
    expect(listFilesOutput.safeParse([]).success).toBe(true);
  });

  it("rejects a non-array", () => {
    expect(listFilesOutput.safeParse(validEntry).success).toBe(false);
  });
});

describe("files.fileInfoOutput", () => {
  it("mirrors fileEntrySchema", () => {
    expect(fileInfoOutput.safeParse(validEntry).success).toBe(true);
    expect(fileInfoOutput.safeParse({}).success).toBe(false);
  });
});
