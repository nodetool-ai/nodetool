import { describe, expect, it } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  assetUriForBareId,
  isStorageReference,
  ownedStorageReference
} from "../src/capabilities/storage-reference.js";

const OWN_ID = "a".repeat(32);
const OTHER_ID = "b".repeat(32);

function contextOwning(
  ids: string[],
  withLookup = true
): { context: ProcessingContext; lookups: string[] } {
  const lookups: string[] = [];
  const context = {
    hasModelInterface: (name: string) => withLookup && name === "getAssetInfo",
    getAssetInfo: async (assetId: string) => {
      lookups.push(assetId);
      return ids.includes(assetId)
        ? { id: assetId, content_type: "image/png", name: "x.png", metadata: null }
        : null;
    }
  } as unknown as ProcessingContext;
  return { context, lookups };
}

describe("isStorageReference", () => {
  it("names the forms that read a bucket key directly", () => {
    expect(isStorageReference("supabase://assets/u/x.png")).toBe(true);
    expect(isStorageReference("s3://bucket/x.png")).toBe(true);
    expect(isStorageReference("memory://x.png")).toBe(true);
    expect(isStorageReference("/api/storage/x.png")).toBe(true);
    expect(isStorageReference("api/storage/x.png")).toBe(true);
    expect(isStorageReference("asset://x")).toBe(false);
    expect(isStorageReference("https://example.com/x.png")).toBe(false);
  });

  it("names an http(s) URL whose path is the storage route, on any host", () => {
    // The file storage adapter reads the key from these URLs.
    expect(isStorageReference("https://evil.test/api/storage/u/x.png")).toBe(true);
    expect(isStorageReference("http://localhost:7777/api/storage/x.png")).toBe(true);
    expect(isStorageReference("HTTPS://evil.test/api/storage/x.png")).toBe(true);
    // Parsed, as the adapter parses it: dot segments resolve first.
    expect(isStorageReference("https://evil.test/a/../api/storage/x.png")).toBe(true);
    expect(isStorageReference("https://evil.test/a/%2e%2e/api/storage/x.png")).toBe(true);
    expect(isStorageReference("https://evil.test/v1/api/storage/x.png")).toBe(false);
  });
});

describe("assetUriForBareId", () => {
  it("turns a full or short asset id into an asset URI", () => {
    expect(assetUriForBareId(OWN_ID)).toBe(`asset://${OWN_ID}`);
    expect(assetUriForBareId(OWN_ID.slice(0, 12))).toBe(`asset://${OWN_ID.slice(0, 12)}`);
  });

  it("leaves anything else unchanged", () => {
    for (const value of ["notes.txt", "abc", `asset://${OWN_ID}`, "/tmp/x.png", OWN_ID.slice(0, 20)]) {
      expect(assetUriForBareId(value)).toBe(value);
    }
  });
});

describe("ownedStorageReference", () => {
  it("refuses another user's object named by a storage URI", async () => {
    const { context, lookups } = contextOwning([OWN_ID]);
    const decision = await ownedStorageReference(
      context,
      `supabase://assets/victim-user/${OTHER_ID}.png`
    );
    expect(decision.ok).toBe(false);
    expect(lookups).toEqual([OTHER_ID]);
  });

  it("refuses another user's object named by an http(s) storage-route URL", async () => {
    const { context, lookups } = contextOwning([OWN_ID]);
    for (const value of [
      `https://evil.test/api/storage/victim-user/${OTHER_ID}.png`,
      `http://localhost:7777/api/storage/${OTHER_ID}.png?x=1`,
      `https://evil.test/projects/p1/%2e%2e/%2e%2e/api/storage/${OTHER_ID}.png`
    ]) {
      expect((await ownedStorageReference(context, value, "p1")).ok).toBe(false);
    }
    expect(lookups).toEqual([OTHER_ID, OTHER_ID, OTHER_ID]);
  });

  it("rewrites an owned http(s) storage-route URL to its asset", async () => {
    const { context } = contextOwning([OWN_ID]);
    expect(
      await ownedStorageReference(context, `https://x.test/api/storage/u/${OWN_ID}.png`)
    ).toEqual({ ok: true, ref: `asset://${OWN_ID}` });
  });

  it("refuses a legacy flat key the user does not own", async () => {
    const { context } = contextOwning([OWN_ID]);
    const decision = await ownedStorageReference(context, `/api/storage/${OTHER_ID}.png`);
    expect(decision.ok).toBe(false);
    const relative = await ownedStorageReference(
      context,
      `api/storage/victim-user/${OTHER_ID}.png`,
      "p1"
    );
    expect(relative.ok).toBe(false);
  });

  it("rewrites an owned object to its asset so the read is owner-checked", async () => {
    const { context } = contextOwning([OWN_ID]);
    // The folder is somebody else's: only the asset row decides what is read.
    const decision = await ownedStorageReference(
      context,
      `supabase://assets/victim-user/${OWN_ID}_thumb.jpg`
    );
    expect(decision).toEqual({ ok: true, ref: `asset://${OWN_ID}` });
  });

  it("allows keys under the run's project and sandbox keys", async () => {
    const { context, lookups } = contextOwning([]);
    expect(
      await ownedStorageReference(context, "/api/storage/projects/p1/assets/view-1.png", "p1")
    ).toEqual({ ok: true, ref: "/api/storage/projects/p1/assets/view-1.png" });
    const sandboxKey =
      "/api/storage/sandbox/123e4567-e89b-12d3-a456-426614174000.png";
    expect(await ownedStorageReference(context, sandboxKey)).toEqual({
      ok: true,
      ref: sandboxKey
    });
    expect(lookups).toEqual([]);
  });

  it("refuses another project's key and dot segments, encoded or not", async () => {
    const { context } = contextOwning([OTHER_ID]);
    expect(
      (await ownedStorageReference(context, "/api/storage/projects/p2/assets/x.png", "p1")).ok
    ).toBe(false);
    expect(
      (
        await ownedStorageReference(
          context,
          `/api/storage/projects/p1/../../u/${OTHER_ID}.png`,
          "p1"
        )
      ).ok
    ).toBe(false);
    expect(
      (
        await ownedStorageReference(
          context,
          `/api/storage/projects/p1/%2E%2E/%2E%2E/u/${OTHER_ID}.png`,
          "p1"
        )
      ).ok
    ).toBe(false);
  });

  it("passes everything else through unchanged", async () => {
    const { context, lookups } = contextOwning([]);
    for (const value of [`asset://${OTHER_ID}`, "data:image/png;base64,AA==", "https://x.test/a.png"]) {
      expect(await ownedStorageReference(context, value)).toEqual({ ok: true, ref: value });
    }
    expect(lookups).toEqual([]);
  });

  it("leaves a host with no asset lookup (the single-user CLI) unchanged", async () => {
    const { context } = contextOwning([], false);
    expect(await ownedStorageReference(context, `s3://b/${OTHER_ID}.png`)).toEqual({
      ok: true,
      ref: `s3://b/${OTHER_ID}.png`
    });
  });
});
