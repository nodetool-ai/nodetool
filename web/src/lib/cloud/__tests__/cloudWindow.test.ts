/**
 * @jest-environment node
 */
import { cloudWindowFetch } from "../installCloudWindowFetch";
import { refusedInCloudWindow } from "../cloudWindow";
import { CloudRequestError, type CloudRequester } from "../cloudFetch";
import { cloudDocumentRef } from "../openCloudDocument";

const PAGE = "http://127.0.0.1:7777";
const ORIGIN = { server: "https://api.nodetool.ai", account: "u1" };

function setup() {
  const request = jest.fn<ReturnType<CloudRequester>, Parameters<CloudRequester>>(async () => ({
    ok: true,
    status: 200,
    headers: [["content-type", "application/json"]],
    body: new TextEncoder().encode("{}")
  }));
  const pageFetch = jest.fn(async () => new Response("page")) as unknown as jest.MockedFunction<typeof fetch>;
  return { request, pageFetch, fetch: cloudWindowFetch(ORIGIN, request, pageFetch, PAGE) };
}

describe("the cloud window's fetch", () => {
  it("sends requests to the cloud server through the main process", async () => {
    const { request, pageFetch, fetch } = setup();
    const response = await fetch(`${ORIGIN.server}/trpc/workflows.get?batch=1`, { method: "POST", body: "{}" });
    expect(response.status).toBe(200);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ method: "POST", path: "/trpc/workflows.get?batch=1", body: "{}" })
    );
    await fetch(new URL(`${ORIGIN.server}/api/config`));
    expect(request).toHaveBeenLastCalledWith(expect.objectContaining({ method: "GET", path: "/api/config" }));
    expect(pageFetch).not.toHaveBeenCalled();
  });

  it("refuses the local server's API, relative or absolute, without a request", async () => {
    const { request, pageFetch, fetch } = setup();
    for (const url of ["/api/workflows", "/trpc/workflows.list", `${PAGE}/api/assets/a`, "/ws/download"]) {
      await expect(fetch(url)).rejects.toBeInstanceOf(CloudRequestError);
    }
    expect(request).not.toHaveBeenCalled();
    expect(pageFetch).not.toHaveBeenCalled();
  });

  it("loads the app's own files and other origins as before", async () => {
    const { request, pageFetch, fetch } = setup();
    await fetch("/locales/en.json");
    await fetch("https://example.supabase.co/auth/v1/user");
    expect(pageFetch).toHaveBeenCalledTimes(2);
    expect(request).not.toHaveBeenCalled();
  });
});

describe("refusedInCloudWindow", () => {
  it("covers the local API prefixes on the page's origin only", () => {
    expect(refusedInCloudWindow(new URL(`${PAGE}/api/x`), PAGE)).toBe(true);
    expect(refusedInCloudWindow(new URL(`${PAGE}/ws`), PAGE)).toBe(true);
    expect(refusedInCloudWindow(new URL(`${PAGE}/assets/index.js`), PAGE)).toBe(false);
    expect(refusedInCloudWindow(new URL("http://localhost:7777/api/x"), PAGE)).toBe(false);
  });
});

describe("cloudDocumentRef", () => {
  it("opens the kinds of D26 whose drafts it keeps", () => {
    expect(cloudDocumentRef("workflow", "w1")).toEqual({ type: "workflow", id: "w1" });
    expect(cloudDocumentRef("timeline", "t1")).toEqual({ type: "timeline", id: "t1" });
    expect(cloudDocumentRef("jsscript", "j1")).toEqual({ type: "jsscript", id: "j1" });
    expect(cloudDocumentRef("script", "s2")).toEqual({ type: "script", id: "s2" });
    expect(cloudDocumentRef("sketch", "s1")).toBeNull();
  });
});
