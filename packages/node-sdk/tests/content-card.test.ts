import { describe, expect, it } from "vitest";
import {
  applyContentCardBody,
  isContentCardOutputType,
  primaryDeclaredOutputType,
  tagContentCardBodies
} from "../src/content-card.js";

describe("isContentCardOutputType", () => {
  it("accepts the displayable types", () => {
    for (const t of [
      "image",
      "image_mask",
      "mask",
      "video",
      "audio",
      "model_3d",
      "asset_3d",
      "str",
      "text"
    ]) {
      expect(isContentCardOutputType(t)).toBe(true);
    }
  });

  it("rejects everything else", () => {
    for (const t of ["dict", "any", "list", "float", "int", "bool", undefined]) {
      expect(isContentCardOutputType(t)).toBe(false);
    }
  });
});

describe("primaryDeclaredOutputType", () => {
  it("prefers metadataOutputTypes over outputTypes", () => {
    expect(
      primaryDeclaredOutputType({
        metadataOutputTypes: { video_url: "video" },
        outputTypes: { video_url: "dict", thumbnail: "image" }
      })
    ).toBe("video");
  });

  it("falls back to outputTypes", () => {
    expect(primaryDeclaredOutputType({ outputTypes: { output: "str" } })).toBe(
      "str"
    );
  });

  it("returns undefined when nothing is declared", () => {
    expect(primaryDeclaredOutputType({})).toBeUndefined();
  });
});

describe("applyContentCardBody", () => {
  it("stamps a displayable primary output", () => {
    const cls = { metadataOutputTypes: { output: "video" } };
    applyContentCardBody(cls);
    expect((cls as { body?: string }).body).toBe("content_card");
  });

  it("leaves a non-displayable primary output alone", () => {
    const cls = { outputTypes: { output: "dict" } };
    applyContentCardBody(cls);
    expect((cls as { body?: string }).body).toBeUndefined();
  });

  it("keeps an explicitly declared body", () => {
    const cls = { outputTypes: { voice_id: "str" }, body: "small" };
    applyContentCardBody(cls);
    expect(cls.body).toBe("small");
  });

  it("ignores secondary outputs", () => {
    // Only the first slot drives the preview, matching getNodeMetadata.
    const cls = { outputTypes: { scores: "list", label: "str" } };
    applyContentCardBody(cls);
    expect((cls as { body?: string }).body).toBeUndefined();
  });
});

describe("tagContentCardBodies", () => {
  it("stamps each qualifying class and returns the list", () => {
    const classes = [
      { metadataOutputTypes: { output: "audio" } },
      { outputTypes: { output: "list" } }
    ];
    expect(tagContentCardBodies(classes)).toBe(classes);
    expect((classes[0] as { body?: string }).body).toBe("content_card");
    expect((classes[1] as { body?: string }).body).toBeUndefined();
  });
});
