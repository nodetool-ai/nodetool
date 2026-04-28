/**
 * Tests for removeBase64Images utility.
 */

import { describe, it, expect } from "vitest";
import { removeBase64Images } from "../../src/utils/remove-base64-images.js";
import type { MessageContent } from "@nodetool-ai/runtime";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function textItem(text: string): MessageContent {
  return { type: "text", text } as unknown as MessageContent;
}

function imageUrl(url: string): MessageContent {
  return {
    type: "image_url",
    image: { uri: url }
  } as unknown as MessageContent;
}

function imageBase64DataUri(dataUri: string): MessageContent {
  return {
    type: "image_url",
    image: { uri: dataUri }
  } as unknown as MessageContent;
}

function imageWithData(data: Uint8Array): MessageContent {
  return {
    type: "image_url",
    image: { data }
  } as unknown as MessageContent;
}

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

describe("removeBase64Images", () => {
  it("returns an empty array for empty input", () => {
    expect(removeBase64Images([])).toEqual([]);
  });

  it("preserves text content", () => {
    const items: MessageContent[] = [textItem("hello"), textItem("world")];
    expect(removeBase64Images(items)).toEqual(items);
  });

  it("preserves images with plain HTTPS URLs", () => {
    const item = imageUrl("https://example.com/photo.jpg");
    expect(removeBase64Images([item])).toEqual([item]);
  });

  it("removes images with data: URI (base64)", () => {
    const item = imageBase64DataUri("data:image/png;base64,abc123");
    expect(removeBase64Images([item])).toEqual([]);
  });

  it("removes images with inline data (Buffer/Uint8Array)", () => {
    const item = imageWithData(new Uint8Array([1, 2, 3]));
    expect(removeBase64Images([item])).toEqual([]);
  });

  it("keeps text items while removing base64 images", () => {
    const t1 = textItem("before");
    const img = imageBase64DataUri("data:image/jpeg;base64,xyz");
    const t2 = textItem("after");

    const result = removeBase64Images([t1, img, t2]);
    expect(result).toEqual([t1, t2]);
  });

  it("preserves multiple non-base64 images", () => {
    const img1 = imageUrl("https://example.com/a.jpg");
    const img2 = imageUrl("https://example.com/b.jpg");
    expect(removeBase64Images([img1, img2])).toEqual([img1, img2]);
  });

  it("removes all images when all are base64", () => {
    const items: MessageContent[] = [
      imageBase64DataUri("data:image/png;base64,aaa"),
      imageWithData(new Uint8Array([0]))
    ];
    expect(removeBase64Images(items)).toEqual([]);
  });

  it("handles mixed content: text, URL image, base64 image", () => {
    const t = textItem("msg");
    const url = imageUrl("https://cdn.example.com/img.png");
    const b64 = imageBase64DataUri("data:image/gif;base64,R0lGOD");

    const result = removeBase64Images([t, url, b64]);
    expect(result).toHaveLength(2);
    expect(result).toContain(t);
    expect(result).toContain(url);
    expect(result).not.toContain(b64);
  });

  it("does not mutate the original array", () => {
    const items: MessageContent[] = [
      imageBase64DataUri("data:image/png;base64,xxx")
    ];
    const copy = [...items];
    removeBase64Images(items);
    expect(items).toEqual(copy);
  });
});
