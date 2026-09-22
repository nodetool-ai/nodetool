import { expect, it } from "vitest";
import { attachmentLines } from "../src/chat-media.js";

it("preserves full asset IDs and media URLs from server and provider messages", () => {
  const id = "0123456789abcdef0123456789abcdef";
  expect(
    attachmentLines([
      { type: "text", text: "Done" },
      { type: "image", image: { asset_id: id } },
      { type: "video", video: { uri: "https://example.com/result.mp4" } },
      { type: "image_url", image: { uri: `asset://${id}` } }
    ])
  ).toEqual([
    `image: asset://${id}`,
    "video: https://example.com/result.mp4",
    `image_url: asset://${id}`
  ]);
});
it("does not spill inline media bytes into the transcript", () => {
  expect(
    attachmentLines([
      { type: "image_url", image_url: "data:image/png;base64,PRIVATE" }
    ])
  ).toEqual(["image_url: inline attachment"]);
  expect(
    attachmentLines([{ type: "audio", audio: { data: "PRIVATE" } }])
  ).toEqual(["audio: inline attachment"]);
  expect(attachmentLines([{ type: "image", image: { asset_id: 42 } }])).toEqual(
    []
  );
});
