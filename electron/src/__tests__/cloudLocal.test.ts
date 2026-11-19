/**
 * The cloud window's calls of the local store (D27). The local server is a fake fetch.
 */
jest.mock("../types.d", () => ({}));

import { callCloudLocal, serverKeyOf, type CloudLocalDeps } from "../cloudLocal";

const ORIGIN = { server: "https://api.nodetool.ai", account: "u1" };

function setup(answer: () => Response = () => Response.json({ result: { data: { draft_id: "d1" } } })) {
  const calls: { url: string; init: RequestInit }[] = [];
  const deps: CloudLocalDeps = {
    originFor: (id) => (id === 10 ? ORIGIN : null),
    localOrigin: () => "http://127.0.0.1:7777",
    localClientToken: () => "local-token",
    fetch: async (url, init) => {
      calls.push({ url, init });
      return answer();
    },
  };
  return { deps, calls };
}

test("the cloud window's call reaches the local server with the token, under its own server and account", async () => {
  const { deps, calls } = setup();
  const result = await callCloudLocal(deps, 10, "cloudLocal.drafts.put", {
    server_key: "someone-else",
    account_id: "u2",
    kind: "workflow",
    document_id: "w1",
    draft: "{}",
  });
  expect(result).toEqual({ ok: true, data: { draft_id: "d1" } });
  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe("http://127.0.0.1:7777/trpc/cloudLocal.drafts.put");
  expect(calls[0].init.headers).toContainEqual(["x-nodetool-local-client", "local-token"]);
  expect(JSON.parse(String(calls[0].init.body))).toEqual({
    server_key: serverKeyOf(ORIGIN.server),
    account_id: "u1",
    kind: "workflow",
    document_id: "w1",
    draft: "{}",
  });
});

test("another window, another procedure and a stopped server get no call", async () => {
  const { deps, calls } = setup();
  expect(await callCloudLocal(deps, 11, "cloudLocal.drafts.get", {})).toEqual({ ok: false, error: "REFUSED" });
  expect(await callCloudLocal(deps, 10, "workflows.list", {})).toEqual({ ok: false, error: "REFUSED" });
  expect(await callCloudLocal(deps, 10, "cloudTransfer.send.run", {})).toEqual({ ok: false, error: "REFUSED" });
  expect(await callCloudLocal({ ...deps, localOrigin: () => null }, 10, "cloudLocal.drafts.get", {})).toEqual({
    ok: false,
    error: "UNAVAILABLE",
  });
  expect(
    await callCloudLocal({ ...deps, localOrigin: () => "https://example.com" }, 10, "cloudLocal.drafts.get", {})
  ).toEqual({ ok: false, error: "UNAVAILABLE" });
  expect(calls).toHaveLength(0);
});

test("a refusal of the local server comes back with its message, and a dead server as unavailable", async () => {
  const refused = setup(() => Response.json({ error: { message: "The cloud local store exists only on a local server" } }, { status: 503 }));
  expect(await callCloudLocal(refused.deps, 10, "cloudLocal.drafts.get", {})).toEqual({
    ok: false,
    error: "FAILED",
    message: "The cloud local store exists only on a local server",
  });
  const dead = setup(() => {
    throw new TypeError("fetch failed");
  });
  expect(await callCloudLocal(dead.deps, 10, "cloudLocal.drafts.get", {})).toEqual({ ok: false, error: "UNAVAILABLE" });
});

test("the server key is the first 16 hex characters of the origin's SHA-256", () => {
  expect(serverKeyOf("https://api.nodetool.ai")).toBe("bbc379c60449683f");
});
