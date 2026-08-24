/**
 * `download_file` with a stored ref in place of a URL: `asset://`, a
 * `/api/storage/` key, or a `data:` URI resolve host-side instead of going
 * through `safeFetch`, which could only ever refuse them.
 */

import { describe, expect, it } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { toolFromCapability } from "../src/capabilities/adapters.js";
import { createCapabilityRun } from "../src/capabilities/invoke.js";
import { WEB_CAPABILITIES } from "../src/capabilities/web.js";
import type { CapabilityGate } from "../src/capabilities/types.js";
import { Tool } from "../src/tools/base-tool.js";

const gate: CapabilityGate = {
  mode: "auto",
  sessionAllow: new Set<string>(),
  requestApproval: async () => "allow"
};

function downloadFileTool(): Tool {
  const entry = WEB_CAPABILITIES.find((c) => c.spec.name === "download_file");
  if (!entry) throw new Error("download_file is not registered");
  return toolFromCapability(entry.spec, entry.impl, (context) =>
    createCapabilityRun({ context, gate })
  );
}

describe("download_file with a stored ref", () => {
  /** A context whose workspace is an in-memory map, with one asset in it. */
  function refContext(assets: Record<string, Uint8Array>) {
    const written = new Map<string, Uint8Array>();
    const context = {
      userId: "user-1",
      workspace: {
        localDir: null,
        write: async (key: string, bytes: Uint8Array) => {
          written.set(key, bytes);
        },
        read: async () => null,
        key: (p: string) => p
      },
      resolveAssetBytes: async (uri: string) => ({ bytes: assets[uri] ?? null })
    } as unknown as ProcessingContext;
    return { context, written };
  }

  it("copies an asset:// URI into the workspace instead of refusing it", async () => {
    // `asset://` is a stored identifier, not a URL — on the cloud backends the
    // bytes sit behind a signed URL only the server can mint. safeFetch could
    // only ever refuse it, and did: a session holding three generated clips
    // was told they were "unsafe URLs" and had no way to reach them at all.
    const bytes = new Uint8Array([0, 1, 2, 3]);
    const { context, written } = refContext({ "asset://abc.mp4": bytes });

    const result = (await downloadFileTool().process(context, {
      url: "asset://abc.mp4",
      output_file: "clip.mp4"
    })) as Record<string, unknown>;

    expect(result["success"]).toBe(true);
    expect(result["file_size_bytes"]).toBe(4);
    expect(result["content_type"]).toBe("video/mp4");
    expect(written.get("clip.mp4")).toEqual(bytes);
  });

  it("decodes a data: URI and takes its declared type", async () => {
    const { context, written } = refContext({});
    const result = (await downloadFileTool().process(context, {
      url: "data:text/plain;base64,aGk=",
      output_file: "note.txt"
    })) as Record<string, unknown>;

    expect(result["success"]).toBe(true);
    expect(result["content_type"]).toBe("text/plain");
    expect(new TextDecoder().decode(written.get("note.txt"))).toBe("hi");
  });

  it("says the ref resolved to nothing rather than writing an empty file", async () => {
    const { context, written } = refContext({});
    const result = (await downloadFileTool().process(context, {
      url: "asset://missing.mp4",
      output_file: "clip.mp4"
    })) as Record<string, unknown>;

    expect(result["success"]).toBe(false);
    expect(String(result["error"])).toMatch(/resolved to no bytes/);
    expect(written.has("clip.mp4")).toBe(false);
  });
});
