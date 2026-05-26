import { describe, it, expect } from "vitest";
import { expandAssetReferences } from "@nodetool-ai/llm-nodes";

describe("expandAssetReferences", () => {
  it("returns a single text block when there is no asset reference", () => {
    expect(expandAssetReferences("just some text")).toEqual([
      { type: "text", text: "just some text" }
    ]);
  });

  it("splits an inline image reference into text + image block", () => {
    const parts = expandAssetReferences("Describe asset://abc.png please");
    expect(parts).toEqual([
      { type: "text", text: "Describe " },
      { type: "image_url", image: { uri: "asset://abc.png", mimeType: "image/png" } },
      { type: "text", text: " please" }
    ]);
  });

  it("encodes audio references as audio blocks carrying the asset URI", () => {
    expect(expandAssetReferences("asset://clip.mp3")).toEqual([
      { type: "audio", audio: { uri: "asset://clip.mp3", mimeType: "audio/mpeg" } }
    ]);
  });

  it("leaves unsupported media types as literal text", () => {
    expect(expandAssetReferences("open asset://doc.txt now")).toEqual([
      { type: "text", text: "open asset://doc.txt now" }
    ]);
  });

  it("does not swallow a trailing sentence period into the reference", () => {
    const parts = expandAssetReferences("Here: asset://abc.png.");
    expect(parts).toEqual([
      { type: "text", text: "Here: " },
      { type: "image_url", image: { uri: "asset://abc.png", mimeType: "image/png" } },
      { type: "text", text: "." }
    ]);
  });

  it("handles multiple references and keeps the URI verbatim for resolution", () => {
    const parts = expandAssetReferences(
      "compare asset://a.jpg and asset://b.webp"
    );
    expect(parts).toEqual([
      { type: "text", text: "compare " },
      { type: "image_url", image: { uri: "asset://a.jpg", mimeType: "image/jpeg" } },
      { type: "text", text: " and " },
      { type: "image_url", image: { uri: "asset://b.webp", mimeType: "image/webp" } }
    ]);
  });
});
