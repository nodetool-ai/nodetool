import { describe, it, expect, vi, afterEach } from "vitest";

import { renderMcpAppHtml } from "../src/mcp-apps/shell.js";
import { getNodesAppHtml } from "../src/mcp-apps/nodes-app.js";
import { getCollectionsAppHtml } from "../src/mcp-apps/collections-app.js";
import { getGetWorkflowAppHtml } from "../src/mcp-apps/get-workflow-app.js";
import { getListAssetsAppHtml } from "../src/mcp-apps/list-assets-app.js";
import { getListJobsAppHtml } from "../src/mcp-apps/list-jobs-app.js";
import { getListWorkflowsAppHtml } from "../src/mcp-apps/list-workflows-app.js";

describe("renderMcpAppHtml (shell)", () => {
  it("produces a full HTML document with title, body and inlined bundle", async () => {
    const html = await renderMcpAppHtml({
      title: "My App",
      body: "const marker = 'BODY_MARKER';"
    });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<title>My App</title>");
    // Per-app body is injected verbatim.
    expect(html).toContain("const marker = 'BODY_MARKER';");
    // The ext-apps bundle is rewritten to a globalThis assignment (no ESM export).
    expect(html).toContain("globalThis.__mcpExtApps={");
    // The shell runtime helpers are present.
    expect(html).toContain("function parseToolResult(params)");
    expect(html).toContain("function bootstrap(appName)");
  });

  it("escapes HTML-special characters in the title", async () => {
    const html = await renderMcpAppHtml({
      title: 'A & B < C > "D"',
      body: ""
    });
    expect(html).toContain("<title>A &amp; B &lt; C &gt; &quot;D&quot;</title>");
    // The raw, unescaped title must not leak into the document.
    expect(html).not.toContain('<title>A & B < C > "D"</title>');
  });

  it("defaults appName to a slug of the title when appName is omitted", async () => {
    const html = await renderMcpAppHtml({
      title: "Hello World!",
      body: ""
    });
    // slugify lowercases, replaces runs of non-alphanumerics with '-',
    // and trims leading/trailing dashes.
    expect(html).toContain('bootstrap("nodetool-hello-world")');
  });

  it("honors an explicit appName over the slug", async () => {
    const html = await renderMcpAppHtml({
      title: "Anything",
      appName: "custom-app-name",
      body: ""
    });
    expect(html).toContain('bootstrap("custom-app-name")');
    expect(html).not.toContain('bootstrap("nodetool-anything")');
  });

  it("injects an extra <style> block only when css is provided", async () => {
    const withCss = await renderMcpAppHtml({
      title: "T",
      css: ".sentinel{color:red}",
      body: ""
    });
    expect(withCss).toContain(".sentinel{color:red}");
    // The base stylesheet is always present, so there are two <style> tags.
    expect(withCss.match(/<style>/g)?.length).toBe(2);

    const withoutCss = await renderMcpAppHtml({ title: "T2", body: "" });
    expect(withoutCss.match(/<style>/g)?.length).toBe(1);
  });

  it("neutralizes closing script tags in the per-app body to avoid breakout", async () => {
    const html = await renderMcpAppHtml({
      title: "T",
      body: "var x = '</script><script>alert(1)</script>';"
    });
    // The raw closing tag from the body must be escaped.
    expect(html).toContain("<\\/script");
    expect(html).not.toContain("</script><script>alert(1)");
  });
});

describe("mcp-apps HTML definition modules", () => {
  const apps: Array<{
    name: string;
    fn: () => Promise<string>;
    appName: string;
    title: string;
  }> = [
    { name: "nodes", fn: getNodesAppHtml, appName: "nodetool-nodes", title: "NodeTool Nodes" },
    {
      name: "collections",
      fn: getCollectionsAppHtml,
      appName: "nodetool-collections",
      title: "NodeTool Collections"
    },
    {
      name: "get-workflow",
      fn: getGetWorkflowAppHtml,
      appName: "nodetool-get-workflow",
      title: "NodeTool Workflow Graph"
    },
    {
      name: "list-assets",
      fn: getListAssetsAppHtml,
      appName: "nodetool-list-assets",
      title: "NodeTool Assets"
    },
    {
      name: "list-jobs",
      fn: getListJobsAppHtml,
      appName: "nodetool-list-jobs",
      title: "NodeTool Jobs"
    },
    {
      name: "list-workflows",
      fn: getListWorkflowsAppHtml,
      appName: "nodetool-list-workflows",
      title: "NodeTool Workflows"
    }
  ];

  for (const app of apps) {
    it(`${app.name}: renders a document with its title, appName and handler`, async () => {
      const html = await app.fn();
      expect(html.startsWith("<!doctype html>")).toBe(true);
      expect(html).toContain(`<title>${app.title}</title>`);
      expect(html).toContain(`bootstrap("${app.appName}")`);
      // Every app wires a tool-result handler and the shared parseToolResult glue.
      expect(html).toContain("app.ontoolresult");
      expect(html).toContain("function parseToolResult");
    });

    it(`${app.name}: caches its rendered HTML (same reference on repeat)`, async () => {
      const first = await app.fn();
      const second = await app.fn();
      expect(second).toBe(first);
    });
  }

  it("nodes app references its server-side tools", async () => {
    const html = await getNodesAppHtml();
    expect(html).toContain("search_nodes");
    expect(html).toContain("get_node_info");
  });

  it("collections app references query_collection tool and hit normalization", async () => {
    const html = await getCollectionsAppHtml();
    expect(html).toContain("query_collection");
    expect(html).toContain("normalizeHits");
  });

  it("get-workflow app references its SVG layout builder", async () => {
    const html = await getGetWorkflowAppHtml();
    expect(html).toContain("computeLayout");
    expect(html).toContain("http://www.w3.org/2000/svg");
  });

  it("list-assets app references list_assets pagination arguments", async () => {
    const html = await getListAssetsAppHtml();
    expect(html).toContain("list_assets");
    expect(html).toContain("start_key");
  });

  it("list-jobs app references get_job / get_workflow drilldowns", async () => {
    const html = await getListJobsAppHtml();
    expect(html).toContain("get_job");
    expect(html).toContain("get_workflow");
  });

  it("list-workflows app references run_workflow tool", async () => {
    const html = await getListWorkflowsAppHtml();
    expect(html).toContain("run_workflow");
  });
});

// The bundle-inlining logic and its error branch live behind loadExtAppsBundle,
// which caches at module scope. Re-import the module with a mocked fs so we can
// drive both the alias-parsing happy path and the "no trailing export" throw.
describe("inlinableBundle branches (isolated, mocked fs)", () => {
  afterEach(() => {
    vi.doUnmock("node:fs/promises");
    vi.resetModules();
  });

  it("rewrites `export { a as Foo, b }` into a globalThis assignment", async () => {
    vi.resetModules();
    vi.doMock("node:fs/promises", () => ({
      readFile: vi.fn(async () => "var a=1;var b=2;export { a as Foo, b };")
    }));
    const mod = await import("../src/mcp-apps/shell.js");
    const html = await mod.renderMcpAppHtml({ title: "Iso", body: "" });
    // Aliased export becomes exportedName:localName; plain export maps to itself.
    expect(html).toContain("globalThis.__mcpExtApps={Foo:a,b:b};");
    // The trailing ESM export statement itself is dropped.
    expect(html).not.toContain("export { a as Foo, b };");
  });

  it("escapes closing script tags inside the bundle body", async () => {
    vi.resetModules();
    vi.doMock("node:fs/promises", () => ({
      readFile: vi.fn(async () => "var s='</script>';export { s };")
    }));
    const mod = await import("../src/mcp-apps/shell.js");
    const html = await mod.renderMcpAppHtml({ title: "Iso2", body: "" });
    expect(html).toContain("<\\/script");
    expect(html).toContain("globalThis.__mcpExtApps={s:s};");
  });

  it("throws when the bundle has no trailing export statement", async () => {
    vi.resetModules();
    vi.doMock("node:fs/promises", () => ({
      readFile: vi.fn(async () => "var noExportHere = 1;")
    }));
    const mod = await import("../src/mcp-apps/shell.js");
    await expect(
      mod.renderMcpAppHtml({ title: "Iso3", body: "" })
    ).rejects.toThrow(/unable to locate trailing export/);
  });
});
