import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { VerifiedStandaloneAssets } from "../src/standalone-assets.js";

const bytes = new Uint8Array([1, 2, 3]);
const digest = createHash("sha256").update(bytes).digest("hex");
const path = `./assets/${digest}.wav`;
const binding = { assetId: "owned-audio", digest, mediaKind: "audio" };
const owners: VerifiedStandaloneAssets[] = [];
afterEach(() => { for (const owner of owners.splice(0)) { owner.dispose(); } vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function owner(candidate = path): VerifiedStandaloneAssets {
  const assets = new VerifiedStandaloneAssets({ audio: binding }, { audio: candidate });
  owners.push(assets);
  return assets;
}
function response(value = bytes): Response { return new Response(Uint8Array.from(value)); }

it.each([`./assets/${digest}.wav?redirect=x`, `../assets/${digest}.wav`, `https://example.com/${digest}.wav`,
  `./assets/${"f".repeat(64)}.wav`, `./assets/${digest}.png`])("rejects unbound local media path %s", async (candidate) => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  await expect(owner(candidate).bytes("audio")).rejects.toThrow(/path|format/);
  expect(fetcher).not.toHaveBeenCalled();
});

it("rejects replaced content and retries a subsequent healthy request", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(response(new Uint8Array([4, 5, 6]))).mockResolvedValue(response());
  vi.stubGlobal("fetch", fetcher);
  const assets = owner();
  await expect(assets.bytes("audio")).rejects.toThrow(/digest/);
  expect(await assets.bytes("audio")).toEqual(bytes);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ redirect: "error", signal: expect.any(AbortSignal) });
});

it("shares one verified request and protects cached bytes from decoder mutation", async () => {
  const fetcher = vi.fn(async () => response()); vi.stubGlobal("fetch", fetcher);
  const assets = owner();
  const [first, second] = await Promise.all([assets.bytes("audio"), assets.bytes("audio")]);
  if (!first) { throw new Error("Missing owned bytes"); }
  first.fill(0);
  expect(second).toEqual(bytes);
  expect(await assets.bytes("audio")).toEqual(bytes);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("creates one verified Blob URL and revokes it on disposal", async () => {
  const originalFetch = fetch;
  const fetcher = vi.fn(async () => response()); vi.stubGlobal("fetch", fetcher);
  const assets = owner();
  const url = await assets.bindingUrl(binding);
  if (!url) { throw new Error("Missing media URL"); }
  expect(url).toMatch(/^blob:/);
  expect(await assets.url("audio")).toBe(url);
  const fetched = await originalFetch(url);
  expect(fetched.headers.get("content-type")).toBe("audio/wav");
  expect(new Uint8Array(await fetched.arrayBuffer())).toEqual(bytes);
  expect(fetcher).toHaveBeenCalledTimes(1);
  assets.dispose();
  await expect(originalFetch(url)).rejects.toThrow();
});

it("does not publish a new Blob URL after disposal during hashing", async () => {
  const originalDigest = crypto.subtle.digest.bind(crypto.subtle);
  const gate = Promise.withResolvers<void>();
  vi.spyOn(crypto.subtle, "digest").mockImplementation(async (...args) => { await gate.promise; return originalDigest(...args); });
  vi.stubGlobal("fetch", async () => response());
  const created = vi.spyOn(URL, "createObjectURL");
  const assets = owner();
  const pending = assets.url("audio");
  await vi.waitFor(() => expect(crypto.subtle.digest).toHaveBeenCalled());
  assets.dispose(); gate.resolve();
  await expect(pending).rejects.toThrow(/abort/i);
  expect(created).not.toHaveBeenCalled();
});

it("fails explicitly if the verified Blob URL cannot be created", async () => {
  vi.stubGlobal("fetch", async () => response());
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => { throw new Error("Blob URLs unavailable"); });
  await expect(owner().url("audio")).rejects.toThrow(/Verified media URL/);
});
