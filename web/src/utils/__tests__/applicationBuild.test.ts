import { buildApplication, specifyApplication } from "../applicationBuild";
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

it("reports each stage a poll of the running build names", async () => {
  fetchMock
    .mockResolvedValueOnce(json({ status: "running", session_id: "s1" }))
    .mockResolvedValueOnce(
      json({ status: "running", progress: { stage: "plan", round: 0 } })
    )
    .mockResolvedValueOnce(json({ status: "running" }))
    .mockResolvedValueOnce(
      json({ status: "running", progress: { stage: "author", round: 1 } })
    )
    .mockResolvedValueOnce(
      json({ status: "completed", verdict: { ok: true }, bundle })
    );
  const onProgress = jest.fn();
  await buildApplication({ prompt: "x", provider: "p", model: "m", pollMs: 0, onProgress });
  expect(onProgress.mock.calls).toEqual([
    [{ stage: "plan", round: 0 }],
    [{ stage: "author", round: 1 }]
  ]);
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

const spec = {
  title: "Blurbs",
  operations: [],
  variables: [],
  widgets: [],
  interactions: []
};

it("builds a reviewed spec instead of the prompt, under the caller's cap", async () => {
  fetchMock
    .mockResolvedValueOnce(json({ status: "running", session_id: "s1" }))
    .mockResolvedValueOnce(
      json({ status: "completed", verdict: { ok: true }, bundle })
    );
  await buildApplication({
    prompt: "A blurb page",
    spec,
    provider: "openai",
    model: "m",
    costCapUsd: 2,
    pollMs: 0
  });
  expect(fetchMock).toHaveBeenNthCalledWith(
    1,
    "/api/applications/build",
    expect.objectContaining({
      body: JSON.stringify({ spec, provider: "openai", model: "m", cost_cap_usd: 2, poll: true })
    })
  );
});

it("writes a spec through the spec endpoint and resolves with it", async () => {
  fetchMock
    .mockResolvedValueOnce(json({ status: "running", session_id: "s2" }))
    .mockResolvedValueOnce(json({ status: "completed", spec, issues: [] }));
  await expect(
    specifyApplication({ prompt: "A blurb page", provider: "openai", model: "m", pollMs: 0 })
  ).resolves.toEqual(spec);
  expect(fetchMock).toHaveBeenNthCalledWith(
    1,
    "/api/applications/spec",
    expect.objectContaining({
      body: JSON.stringify({ prompt: "A blurb page", provider: "openai", model: "m", poll: true })
    })
  );
});

it("rejects with the reason when no spec came back", async () => {
  fetchMock
    .mockResolvedValueOnce(json({ status: "running", session_id: "s2" }))
    .mockResolvedValueOnce(
      json({ status: "failed", spec: null, error: "widget type Slider9 is not in the catalog" })
    );
  await expect(
    specifyApplication({ prompt: "x", provider: "p", model: "m", pollMs: 0 })
  ).rejects.toThrow("The design could not be written: widget type Slider9 is not in the catalog");
});
