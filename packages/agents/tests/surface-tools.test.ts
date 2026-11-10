import { describe, expect, it, vi } from "vitest";
import { ProcessingContext } from "@nodetool-ai/runtime";
import { createCapabilityRun } from "../src/capabilities/invoke.js";
import { capabilitySpec } from "../src/capabilities/metadata.js";
import { surfaceServerTools } from "../src/capabilities/surface-tools.js";

const MEDIA_TOOLS = [
  "preview_timeline_frame",
  "render_timeline",
  "edit_timeline",
  "set_timeline_document",
  "analyze_video",
  "understand_video",
  "analyze_audio",
  "media_edit",
  "media_probe",
  "generate_image",
  "generate_video",
  "generate_speech",
  "invoke_node",
  "run_workflow",
  "run_code",
  "run_js_script",
  "save_asset",
  "render_sketch",
  "extract_pdf_text"
];

describe("surfaceServerTools", () => {
  it("does not limit an ordinary chat", () => {
    expect(surfaceServerTools(undefined)).toBeNull();
    expect(surfaceServerTools("workspace_chat")).toBeNull();
    expect(surfaceServerTools("toString")).toBeNull();
  });

  it("names only registered capabilities for the timeline assistant", () => {
    const allowed = surfaceServerTools("timeline_assistant");
    expect(allowed?.size).toBeGreaterThan(0);
    const unknown = [...(allowed ?? [])].filter((name) => !capabilitySpec(name));
    expect(unknown).toEqual([]);
  });

  it("leaves the media, render and timeline-document tools out", () => {
    const allowed = surfaceServerTools("timeline_assistant");
    for (const name of MEDIA_TOOLS) {
      expect(capabilitySpec(name), name).toBeDefined();
      expect(allowed?.has(name), name).toBe(false);
    }
  });
});

describe("createCapabilityRun allowedNames", () => {
  const spec = {
    name: "probe_media",
    description: "A media tool",
    inputSchema: { type: "object" },
    category: "read" as const
  };
  const gate = { mode: "auto" as const, sessionAllow: new Set<string>(), requestApproval: async () => "allow" as const };
  const context = () => new ProcessingContext({ userId: "u", jobId: "j" });

  it("refuses a name outside the list before the implementation runs", async () => {
    const impl = vi.fn(async () => ({ ok: true }));
    const run = createCapabilityRun({
      context: context(),
      gate,
      capabilities: [{ spec, impl }],
      allowedNames: new Set(["other"])
    });
    await expect(run.invoke("probe_media", {})).rejects.toThrow("not available in this assistant");
    expect(impl).not.toHaveBeenCalled();
  });

  it("serves a name on the list", async () => {
    const impl = vi.fn(async () => ({ ok: true }));
    const run = createCapabilityRun({
      context: context(),
      gate,
      capabilities: [{ spec, impl }],
      allowedNames: new Set(["probe_media"])
    });
    await expect(run.invoke("probe_media", {})).resolves.toMatchObject({ ok: true });
  });
});
