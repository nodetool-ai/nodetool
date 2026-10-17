import { buildApplication } from "../applicationBuild";
import { restFetch } from "../../lib/rest-fetch";

jest.mock("../../lib/rest-fetch", () => ({ restFetch: jest.fn() }));

const fetchMock = restFetch as jest.MockedFunction<typeof restFetch>;

const json = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => body }) as unknown as Response;

const bundle = { name: "Product blurb", app: {}, workflows: [] };

beforeEach(() => fetchMock.mockReset());

it("starts a polled build and resolves with a green build's bundle", async () => {
  fetchMock
    .mockResolvedValueOnce(json({ status: "running", session_id: "s1" }))
    .mockResolvedValueOnce(json({ status: "running", session_id: "s1" }))
    .mockResolvedValueOnce(
      json({ status: "completed", verdict: { ok: true }, bundle })
    );
  await expect(
    buildApplication({ prompt: "A blurb page", provider: "openai", model: "m", pollMs: 0 })
  ).resolves.toEqual({ bundle, name: "Product blurb" });
  expect(fetchMock).toHaveBeenNthCalledWith(
    1,
    "/api/applications/build",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ prompt: "A blurb page", provider: "openai", model: "m", poll: true })
    })
  );
  expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/debug/sessions/s1", expect.any(Object));
});

it("rejects with the verdict's reason when the build is not green", async () => {
  fetchMock
    .mockResolvedValueOnce(json({ status: "running", session_id: "s1" }))
    .mockResolvedValueOnce(
      json({ status: "failed", verdict: { ok: false, reason: "the button shows nothing" }, bundle: null })
    );
  await expect(
    buildApplication({ prompt: "x", provider: "p", model: "m", pollMs: 0 })
  ).rejects.toThrow("The app did not pass its test run: the button shows nothing");
});

it("rejects with the server's detail when the build cannot start", async () => {
  fetchMock.mockResolvedValueOnce(json({ detail: "An app build needs a provider" }, 400));
  await expect(
    buildApplication({ prompt: "x", provider: "p", model: "m", pollMs: 0 })
  ).rejects.toThrow("An app build needs a provider");
});

it("cancels the server's build when the caller aborts", async () => {
  fetchMock
    .mockResolvedValueOnce(json({ status: "running", session_id: "s1" }))
    .mockResolvedValue(json({}));
  const controller = new AbortController();
  const pending = buildApplication({
    prompt: "x",
    provider: "p",
    model: "m",
    pollMs: 60_000,
    signal: controller.signal
  });
  // Let the start request land before aborting the wait that follows it.
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.abort();
  await expect(pending).rejects.toThrow("Aborted");
  expect(fetchMock).toHaveBeenCalledWith("/api/debug/sessions/s1/cancel", { method: "POST" });
});
