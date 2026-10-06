import { createHash } from "node:crypto";
import { createNative3DGame, createTopDownRoomGame } from "@nodetool-ai/game-runtime";
import { publishGameDraft } from "../gamePublish";

it("F18 reads the current revision after flushing instead of publishing a cached revision", async () => {
  const document = createTopDownRoomGame("publish-room");
  const flush = jest.fn(async () => undefined);
  const fetchRevision = jest.fn(async () => "current-revision");
  const publish = jest.fn(async () => undefined);
  await publishGameDraft({ id: document.id, document, flight: { current: null }, flush,
    getDraft: () => ({ document, baseUpdatedAt: "current-token" }), fetchRevision, publish });
  expect(fetchRevision).toHaveBeenCalledTimes(1);
  expect(publish).toHaveBeenCalledWith(expect.objectContaining({ baseRevision: "current-revision" }));
  expect(flush.mock.invocationCallOrder[0]).toBeLessThan(fetchRevision.mock.invocationCallOrder[0]);
});

it("F19 sends the validated document and rejects edits that arrive during its flush", async () => {
  const document = createTopDownRoomGame("publish-room");
  const publish = jest.fn(async () => undefined);
  await expect(publishGameDraft({ id: document.id, document, flight: { current: null }, publish,
    flush: async () => { document.scenes[0].name = "Unseen edit"; },
    getDraft: () => ({ document, baseUpdatedAt: "updated-token" }),
    fetchRevision: async () => "current" })).rejects.toThrow("Review changes before publishing");
  expect(publish).not.toHaveBeenCalled();
});

it("F19 shares an in-flight publication instead of publishing twice on a double click", async () => {
  const document = createTopDownRoomGame("publish-room");
  const publish = jest.fn(async () => undefined);
  const options = { id: document.id, document, flight: { current: null }, publish,
    flush: async () => undefined, getDraft: () => ({ document, baseUpdatedAt: "current-token" }),
    fetchRevision: async () => "current" };
  await Promise.all([publishGameDraft(options), publishGameDraft(options)]);
  expect(publish).toHaveBeenCalledTimes(1);
});

it("publishes exactly the validated 3D document with its saved token and content digest", async () => {
  const document = createNative3DGame("publish-spatial");
  const publish = jest.fn(async () => undefined);
  await publishGameDraft({ id: document.id, document, flight: { current: null }, publish,
    flush: async () => undefined, getDraft: () => ({ document, baseUpdatedAt: "saved-token" }),
    fetchRevision: async () => "current" });
  expect(publish).toHaveBeenCalledWith({ id: document.id, baseRevision: "current", baseUpdatedAt: "saved-token",
    document, expectedDigest: createHash("sha256").update(JSON.stringify(document)).digest("hex") });
});

it("validates a 3D document before saving or publishing it", async () => {
  const document = { ...createNative3DGame("publish-spatial"), entrySceneId: "missing" };
  const flush = jest.fn(async () => undefined);
  const publish = jest.fn(async () => undefined);
  await expect(publishGameDraft({ id: document.id, document, flight: { current: null }, publish, flush,
    getDraft: () => ({ document, baseUpdatedAt: "saved-token" }), fetchRevision: async () => "current" })).rejects.toThrow();
  expect(flush).not.toHaveBeenCalled();
  expect(publish).not.toHaveBeenCalled();
});
