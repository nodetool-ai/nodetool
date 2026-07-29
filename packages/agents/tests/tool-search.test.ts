import { describe, it, expect, vi } from "vitest";
import {
  searchTools,
  formatToolSearchResult,
  formatDeferredToolsReminder,
  ToolSearchTool,
  type ToolSearchEntry
} from "../src/tools/tool-search.js";

const CATALOG: ToolSearchEntry[] = [
  { name: "ui_app_add_component", description: "Add a widget to the app." },
  { name: "ui_app_get_snapshot", description: "Read the open App Builder." },
  { name: "ui_add_node", description: "Add a node to the workflow graph." },
  { name: "ui_connect_nodes", description: "Connect two nodes by an edge." },
  { name: "ui_run_workflow", description: "Run the current workflow." }
];

describe("searchTools", () => {
  it("select: returns exact names in requested order", () => {
    const r = searchTools(CATALOG, "select:ui_run_workflow,ui_add_node");
    expect(r.map((e) => e.name)).toEqual(["ui_run_workflow", "ui_add_node"]);
  });

  it("select: skips unknown and duplicate names", () => {
    const r = searchTools(CATALOG, "select:ui_add_node,nope,ui_add_node");
    expect(r.map((e) => e.name)).toEqual(["ui_add_node"]);
  });

  it("keyword search ranks name matches above description matches", () => {
    const r = searchTools(CATALOG, "app", 5);
    expect(r[0].name.startsWith("ui_app_")).toBe(true);
    expect(r.some((e) => e.name === "ui_app_add_component")).toBe(true);
  });

  it("keyword search respects max_results", () => {
    expect(searchTools(CATALOG, "ui", 2)).toHaveLength(2);
  });

  it("+substr requires the substring in the tool name", () => {
    const r = searchTools(CATALOG, "+node add");
    expect(r.every((e) => e.name.includes("node"))).toBe(true);
    // "ui_add_node" matches the name requirement AND the "add" term.
    expect(r[0].name).toBe("ui_add_node");
  });

  it("returns nothing for an empty query", () => {
    expect(searchTools(CATALOG, "   ")).toEqual([]);
  });
});

describe("formatToolSearchResult", () => {
  it("wraps matches in a <functions> block of <function> lines", () => {
    const out = formatToolSearchResult([
      { name: "ui_add_node", description: "Add a node.", parameters: { type: "object" } }
    ]);
    expect(out.startsWith("<functions>\n")).toBe(true);
    expect(out.trimEnd().endsWith("</functions>")).toBe(true);
    const inner = out.split("\n")[1];
    expect(inner.startsWith("<function>")).toBe(true);
    const json = JSON.parse(inner.replace(/^<function>/, "").replace(/<\/function>$/, ""));
    expect(json).toEqual({
      description: "Add a node.",
      name: "ui_add_node",
      parameters: { type: "object" }
    });
  });

  it("reports no matches clearly", () => {
    expect(formatToolSearchResult([])).toMatch(/no matching tools/i);
  });
});

describe("formatDeferredToolsReminder", () => {
  it("lists every deferred tool name inside a <system-reminder>", () => {
    const out = formatDeferredToolsReminder(CATALOG);
    expect(out).toContain("<system-reminder>");
    for (const e of CATALOG) expect(out).toContain(e.name);
    expect(out).toContain("ToolSearch");
  });

  it("is empty when nothing is deferred", () => {
    expect(formatDeferredToolsReminder([])).toBe("");
  });
});

describe("ToolSearchTool", () => {
  it("reveals matched tools and returns the <functions> block", async () => {
    const revealed: string[] = [];
    const tool = new ToolSearchTool(CATALOG, (entries) =>
      revealed.push(...entries.map((e) => e.name))
    );
    const result = await tool.process({} as never, {
      query: "select:ui_app_get_snapshot"
    });
    expect(revealed).toEqual(["ui_app_get_snapshot"]);
    expect(String(result)).toContain("ui_app_get_snapshot");
  });

  it("does not reveal when there are no matches", async () => {
    const onReveal = vi.fn();
    const tool = new ToolSearchTool(CATALOG, onReveal);
    const result = await tool.process({} as never, { query: "select:missing" });
    expect(onReveal).not.toHaveBeenCalled();
    expect(String(result)).toMatch(/no matching tools/i);
  });
});
