import { startImageFlow } from "../startImageFlow";
import { trpcClient } from "../../../../trpc/client";

jest.mock("../../../../trpc/client", () => ({
  trpcClient: {
    sketch: {
      create: { mutate: jest.fn() },
      update: { mutate: jest.fn() },
      delete: { mutate: jest.fn() }
    }
  }
}));

const sketch = jest.mocked(trpcClient.sketch);

// The sketch is created before its setup is written. A failed write would
// leave an empty sketch behind on every retry, so the sketch goes with it.
it("deletes the new sketch when its setup cannot be written", async () => {
  sketch.create.mutate.mockResolvedValue({
    id: "sk-1",
    document: { sketch: {} }
  } as never);
  sketch.update.mutate.mockRejectedValue(new Error("offline"));
  sketch.delete.mutate.mockResolvedValue({ ok: true } as never);

  await expect(
    startImageFlow({ name: "New image", projectId: "p1", brief: "A fox" })
  ).rejects.toThrow("offline");
  expect(sketch.delete.mutate).toHaveBeenCalledWith({ id: "sk-1" });
});
