import { describe, expect, it } from "vitest";
import { configureFeatures, FeatureNotInstalledError, type ConfiguredFeature } from "../src/index.js";

function feature(id: string, requires: readonly string[] = []): ConfiguredFeature<string[]> {
  return {
    id,
    load: async () => ({
      descriptor: { id, apiVersion: 1, requires, capabilities: [id], nodeTypes: [`${id}.Node`] },
      activate: (events) => {
        events.push(id);
        return () => { events.push(`close:${id}`); };
      }
    })
  };
}

describe("configured features", () => {
  it("keeps catalog ownership when an installed feature implements only some nodes", async () => {
    const catalog = [{ id: "document", apiVersion: 1, nodeTypes: ["lib.pdf.ExtractText", "lib.pdf.ExtractMarkdown", "lib.pdf.OCR"] }];
    const before = await configureFeatures([], {}, catalog);
    const after = await configureFeatures([{
      id: "document",
      load: async () => ({
        descriptor: { id: "document", apiVersion: 1, nodeTypes: ["lib.pdf.ExtractText"] },
        activate: () => {}
      })
    }], {}, catalog);
    expect(() => before.requireNode("lib.pdf.ExtractText")).toThrow(FeatureNotInstalledError);
    expect(() => after.requireNode("lib.pdf.ExtractText")).not.toThrow();
    for (const host of [before, after]) {
      for (const nodeType of ["lib.pdf.ExtractMarkdown", "lib.pdf.OCR"]) {
        expect(() => host.requireNode(nodeType)).toThrow(FeatureNotInstalledError);
        try {
          host.requireNode(nodeType);
        } catch (error) {
          expect(error).toMatchObject({ code: "FEATURE_NOT_INSTALLED", nodeType, featureIds: ["document"] });
        }
      }
      await host.close();
    }
  });
  it("orders a long dependency chain without recursive traversal", async () => {
    const events: string[] = [];
    const configured = Array.from({ length: 10_000 }, (_, index) => feature(`feature-${index}`, index ? [`feature-${index - 1}`] : [])).reverse();
    const host = await configureFeatures(configured, events);
    expect(events).toHaveLength(configured.length);
    expect(events[0]).toBe("feature-0");
    expect(events.at(-1)).toBe("feature-9999");
    await host.close();
  });
  it("starts prerequisites first and closes in reverse order once", async () => {
    const events: string[] = [];
    const host = await configureFeatures([feature("render", ["core"]), feature("core")], events);
    expect(events).toEqual(["core", "render"]);
    expect(host.capabilities).toEqual(["core", "render"]);
    host.requireNode("core.Node");
    await host.close();
    await host.close();
    expect(events).toEqual(["core", "render", "close:render", "close:core"]);
  });

  it("rejects duplicate configuration, missing prerequisites and cycles before activation", async () => {
    const events: string[] = [];
    await expect(configureFeatures([feature("core"), feature("core")], events)).rejects.toThrow("more than once");
    await expect(configureFeatures([feature("render", ["core"])], events)).rejects.toThrow("not configured");
    await expect(configureFeatures([feature("a", ["b"]), feature("b", ["a"])], events)).rejects.toThrow("cycle");
    expect(events).toEqual([]);
  });

  it("rejects incompatible descriptors and overlapping node ownership", async () => {
    const events: string[] = [];
    await expect(configureFeatures([{
      id: "old", load: async () => ({ descriptor: { id: "old", apiVersion: 2 }, activate: () => {} })
    }], events)).rejects.toThrow("unsupported API");
    await expect(configureFeatures([feature("core")], events, [{
      id: "other", apiVersion: 1, nodeTypes: ["core.Node"]
    }])).rejects.toThrow("declared by both");
    expect(events).toEqual([]);
  });

  it("rejects a loader returning another feature and duplicate declarations", async () => {
    const events: string[] = [];
    await expect(configureFeatures([{
      id: "expected", load: feature("different").load
    }], events)).rejects.toThrow("loaded descriptor different");
    await expect(configureFeatures([{
      id: "core", load: async () => ({
        descriptor: { id: "core", apiVersion: 1, nodeTypes: ["Node", "Node"] },
        activate: () => { events.push("started"); }
      })
    }], events)).rejects.toThrow("duplicate declarations");
    expect(events).toEqual([]);
  });

  it("preserves configured load errors and activation errors with rollback", async () => {
    const cause = new Error("broken installed feature");
    await expect(configureFeatures([{ id: "broken", load: async () => { throw cause; } }], []))
      .rejects.toMatchObject({ cause, message: "Loading configured feature broken failed" });
    const events: string[] = [];
    await expect(configureFeatures([feature("core"), {
      id: "broken", load: async () => ({
        descriptor: { id: "broken", apiVersion: 1, requires: ["core"] },
        activate: () => { throw cause; }
      })
    }], events)).rejects.toMatchObject({ cause });
    expect(events).toEqual(["core", "close:core"]);
  });

  it("reports absent feature IDs and preserves unavailable stored node properties", async () => {
    const host = await configureFeatures([], {}, [{ id: "sandbox", apiVersion: 1, nodeTypes: ["Code"] }]);
    const stored = Object.freeze({ type: "Code", properties: Object.freeze({ source: "return 1" }) });
    expect(() => host.requireNode(stored.type)).toThrow(FeatureNotInstalledError);
    try {
      host.requireNode(stored.type);
    } catch (error) {
      expect(error).toMatchObject({ code: "FEATURE_NOT_INSTALLED", featureIds: ["sandbox"] });
    }
    expect(stored.properties).toEqual({ source: "return 1" });
    expect(() => host.requireNode("unknown")).toThrow("Unknown node type");
  });
});
