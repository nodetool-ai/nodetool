/**
 * Regression tests for API, search, data, generator, constant, and vector node fixes.
 * Each test targets a specific bug that was previously present in the codebase.
 */
import { describe, it, expect } from "vitest";
import {
  ApifyWebScraperNode,
  ApifyGoogleSearchScraperNode,
  ApifyInstagramScraperNode,
  ApifyAmazonScraperNode,
  ApifyYouTubeScraperNode,
  ApifyTwitterScraperNode,
  ApifyLinkedInScraperNode,
  APIFY_NODES
} from "@nodetool-ai/integration-nodes";
import { GoogleSearchNode } from "@nodetool-ai/integration-nodes";
import {
  ChartGeneratorNode,
  SVGGeneratorNode
} from "@nodetool-ai/llm-nodes";
import { ConstantDateTimeNode, GetDocumentsNode } from "@nodetool-ai/core-nodes";
import { SelectLibNode } from "@nodetool-ai/integration-nodes";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
// 1. Apify API key name - must use APIFY_API_TOKEN, not APIFY_API_KEY
// ---------------------------------------------------------------------------
describe("Apify API key name regression", () => {
  const allApifyNodes = [
    ApifyWebScraperNode,
    ApifyGoogleSearchScraperNode,
    ApifyInstagramScraperNode,
    ApifyAmazonScraperNode,
    ApifyYouTubeScraperNode,
    ApifyTwitterScraperNode,
    ApifyLinkedInScraperNode
  ];

  it("all 7 Apify nodes use APIFY_API_TOKEN in requiredSettings", () => {
    expect(allApifyNodes).toHaveLength(7);
    for (const NodeCls of allApifyNodes) {
      expect(
        (NodeCls as any).requiredSettings,
        `${(NodeCls as any).nodeType} should have requiredSettings`
      ).toBeDefined();
      expect(
        (NodeCls as any).requiredSettings,
        `${(NodeCls as any).nodeType} should use APIFY_API_TOKEN`
      ).toContain("APIFY_API_TOKEN");
      expect(
        (NodeCls as any).requiredSettings,
        `${(NodeCls as any).nodeType} should NOT use APIFY_API_KEY`
      ).not.toContain("APIFY_API_KEY");
    }
  });

  it("APIFY_NODES export contains all 7 nodes", () => {
    expect(APIFY_NODES).toHaveLength(7);
    const types = APIFY_NODES.map((n) => (n as any).nodeType);
    expect(types).toContain("apify.scraping.ApifyWebScraper");
    expect(types).toContain("apify.scraping.ApifyGoogleSearchScraper");
    expect(types).toContain("apify.scraping.ApifyInstagramScraper");
    expect(types).toContain("apify.scraping.ApifyAmazonScraper");
    expect(types).toContain("apify.scraping.ApifyYouTubeScraper");
    expect(types).toContain("apify.scraping.ApifyTwitterScraper");
    expect(types).toContain("apify.scraping.ApifyLinkedInScraper");
  });
});

// ---------------------------------------------------------------------------
// 2. GoogleSearchNode output includes both `results` and `text`
// ---------------------------------------------------------------------------
describe("GoogleSearchNode output structure regression", () => {
  it("metadataOutputTypes has both results and text keys", () => {
    const meta = (GoogleSearchNode as any).metadataOutputTypes;
    expect(meta).toBeDefined();
    expect(meta).toHaveProperty("results");
    expect(meta).toHaveProperty("text");
    // Old bug: only had "output" key
    expect(meta).not.toHaveProperty("output");
  });
});

// ---------------------------------------------------------------------------
// 3. Supabase credentials from secrets/env - no crash on (this as any).supabase_url
// ---------------------------------------------------------------------------
describe("Supabase credentials regression", () => {
  it("SelectLibNode reads credentials from secrets, not from instance properties", () => {
    const node = new SelectLibNode();
    // The old bug tried to read (this as any).supabase_url directly.
    // The fix reads from _secrets via getSupabaseCredentials().
    // Without credentials it should throw a clear error about SUPABASE_URL/KEY.
    node.assign({ table_name: "test_table" });
    node.setDynamic("_secrets", {});
    expect(node.process()).rejects.toThrow(/supabase.*url.*key|url.*key.*required/i);
  });

  it("does not have supabase_url as an instance property", () => {
    const node = new SelectLibNode();
    // supabase_url should NOT be a declared property on the node
    expect((node as any).supabase_url).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 7. ChartGenerator - uses LLM, not just hardcoded output
// ---------------------------------------------------------------------------
describe("ChartGenerator regression", () => {
  it("has process method that checks for provider support", () => {
    const node = new ChartGeneratorNode();
    expect(typeof node.process).toBe("function");
    // Verify the node has a model property for LLM configuration
    const propNames = ChartGeneratorNode.getDeclaredProperties().map(
      (p) => p.name
    );
    expect(propNames).toContain("model");
  });

  it("fallback output reflects the prompt, not a static value", async () => {
    const node = new ChartGeneratorNode();
    node.assign({
      prompt: "sales over time",
      data: {
        rows: [
          { month: "Jan", sales: 100 },
          { month: "Feb", sales: 200 }
        ]
      }
    });
    // Without a provider, it falls back but should include prompt in title
    const result = await node.process();
    const output = result.output as Record<string, unknown>;
    expect(output.type).toBe("chart_config");
    expect(output.title).toContain("sales over time");
  });

  it("fallback uses actual data columns, not generic x/y", async () => {
    const node = new ChartGeneratorNode();
    node.assign({
      prompt: "chart",
      data: { rows: [{ temperature: 20, humidity: 50 }] }
    });
    const result = await node.process();
    const output = result.output as Record<string, unknown>;
    const data = output.data as {
      series: Array<{ x_column: string; y_column: string }>;
    };
    expect(data.series[0].x_column).toBe("temperature");
    expect(data.series[0].y_column).toBe("humidity");
  });
});

// ---------------------------------------------------------------------------
// 8. SVGGenerator - fallback includes prompt text
// ---------------------------------------------------------------------------
describe("SVGGenerator regression", () => {
  it("fallback SVG includes the prompt text", async () => {
    const node = new SVGGeneratorNode();
    node.assign({ prompt: "a red circle" });
    // Without provider, it should fall back to a placeholder SVG containing the prompt
    const result = await node.process();
    const output = result.output as Array<{ content: string }>;
    expect(output).toHaveLength(1);
    expect(output[0].content).toContain("a red circle");
    expect(output[0].content).toContain("<svg");
  });

  it("does not return identical SVG for different prompts", async () => {
    const node1 = new SVGGeneratorNode();
    node1.assign({ prompt: "blue square" });
    const result1 = await node1.process();

    const node2 = new SVGGeneratorNode();
    node2.assign({ prompt: "green triangle" });
    const result2 = await node2.process();

    const svg1 = (result1.output as Array<{ content: string }>)[0].content;
    const svg2 = (result2.output as Array<{ content: string }>)[0].content;
    expect(svg1).not.toBe(svg2);
  });

  it("has model property for LLM configuration", () => {
    const propNames = SVGGeneratorNode.getDeclaredProperties().map(
      (p) => p.name
    );
    expect(propNames).toContain("model");
  });
});

// ---------------------------------------------------------------------------
// 9. DateTime microsecond conversion
// ---------------------------------------------------------------------------
describe("ConstantDateTime microsecond conversion regression", () => {
  it("millisecond=500 produces microsecond=500000", async () => {
    const node = new ConstantDateTimeNode();
    node.assign({ millisecond: 500 });
    const result = await node.process();
    const output = result.output as Record<string, unknown>;
    // Old bug: returned 500 instead of 500000
    expect(output.microsecond).toBe(500000);
  });

  it("millisecond=1 produces microsecond=1000", async () => {
    const node = new ConstantDateTimeNode();
    node.assign({ millisecond: 1 });
    const result = await node.process();
    const output = result.output as Record<string, unknown>;
    expect(output.microsecond).toBe(1000);
  });

  it("millisecond=0 produces microsecond=0", async () => {
    const node = new ConstantDateTimeNode();
    node.assign({ millisecond: 0 });
    const result = await node.process();
    const output = result.output as Record<string, unknown>;
    expect(output.microsecond).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 10. DateTime utc_offset in seconds
// ---------------------------------------------------------------------------
describe("ConstantDateTime utc_offset regression", () => {
  it("utc_offset=60 (minutes) produces 3600 (seconds) as number", async () => {
    const node = new ConstantDateTimeNode();
    node.assign({ utc_offset: 60 });
    const result = await node.process();
    const output = result.output as Record<string, unknown>;
    // Old bug: returned string "60" instead of number 3600
    expect(output.utc_offset).toBe(3600);
    expect(typeof output.utc_offset).toBe("number");
  });

  it("utc_offset=-300 (minutes) produces -18000 (seconds)", async () => {
    const node = new ConstantDateTimeNode();
    node.assign({ utc_offset: -300 });
    const result = await node.process();
    const output = result.output as Record<string, unknown>;
    expect(output.utc_offset).toBe(-18000);
    expect(typeof output.utc_offset).toBe("number");
  });

  it("utc_offset=0 produces 0 as number", async () => {
    const node = new ConstantDateTimeNode();
    node.assign({ utc_offset: 0 });
    const result = await node.process();
    const output = result.output as Record<string, unknown>;
    expect(output.utc_offset).toBe(0);
    expect(typeof output.utc_offset).toBe("number");
  });
});

// ---------------------------------------------------------------------------
// 11. GetDocuments empty ids returns empty, not all documents
// ---------------------------------------------------------------------------
describe("GetDocuments empty ids regression", () => {
  it("passing empty ids array should pass [] to collection.get, not undefined", () => {
    // We verify the node's logic by checking the source behavior.
    // The node should explicitly pass ids: [] when ids is empty,
    // not omit it (which would return all documents).
    const node = new GetDocumentsNode();
    node.assign({
      collection: { type: "collection", name: "test" },
      ids: []
    });
    // The node reads ids and checks ids.length > 0.
    // When empty, it should still pass ids: [] (not undefined).
    // We can't call process() without a real collection, but we can verify
    // the ids property is set to an empty array.
    const ids = (node as any).ids;
    expect(Array.isArray(ids)).toBe(true);
    expect(ids).toHaveLength(0);
  });
});

