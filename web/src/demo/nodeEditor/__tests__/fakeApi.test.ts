import { answerTrpc } from "../fakeApi";

describe("answerTrpc", () => {
  it("answers a batch in order, with errors for procedures the demo lacks", () => {
    const search = new URLSearchParams({
      batch: "1",
      input: JSON.stringify({ "1": { provider: "gemini" } })
    });
    const body = answerTrpc("/trpc/jobs.list,models.videoByProvider,workflows.get", search) as Array<
      Record<string, unknown>
    >;
    expect(body).toHaveLength(3);
    expect(body[0]).toEqual({ result: { data: { jobs: [], next_start_key: null } } });
    const videos = (body[1].result as { data: Array<{ provider: string }> }).data;
    expect(videos.length).toBeGreaterThan(0);
    expect(videos.every((model) => model.provider === "gemini")).toBe(true);
    expect(body[2]).toHaveProperty("error");
  });

  it("answers an unbatched call with one object", () => {
    const body = answerTrpc("/trpc/models.providers", new URLSearchParams());
    expect(body).toHaveProperty("result.data");
  });
});
