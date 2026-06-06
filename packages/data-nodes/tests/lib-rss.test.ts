import { describe, expect, it } from "vitest";
import http from "node:http";
import {
  FetchRSSFeedLibNode,
  ExtractFeedMetadataLibNode
} from "@nodetool-ai/data-nodes";

const RSS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Example Feed</title>
    <description>Example Desc</description>
    <link>https://example.com</link>
    <language>en-us</language>
    <lastBuildDate>Mon, 03 Mar 2026 00:00:00 GMT</lastBuildDate>
    <generator>testgen</generator>
    <item>
      <title>Item One</title>
      <link>https://example.com/1</link>
      <pubDate>Mon, 03 Mar 2026 00:00:00 GMT</pubDate>
      <description>Summary One</description>
      <author>alice</author>
    </item>
    <item>
      <title>Item Two</title>
      <link>https://example.com/2</link>
      <pubDate>Mon, 03 Mar 2026 01:00:00 GMT</pubDate>
      <description>Summary Two</description>
      <author>bob</author>
    </item>
  </channel>
</rss>`;

const ATOM_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Example</title>
  <subtitle>Atom Desc</subtitle>
  <link href="https://example.com" rel="self"/>
  <link href="https://example.com/home" rel="alternate"/>
  <updated>2026-03-03T00:00:00Z</updated>
  <entry>
    <title>Atom Item One</title>
    <link href="https://example.com/atom-1" rel="alternate"/>
    <id>tag:example.com,2026:post-1</id>
    <published>2026-03-03T00:00:00Z</published>
    <summary>Atom Summary One</summary>
    <author><name>Alice</name></author>
  </entry>
</feed>`;

async function withServerXml(
  xml: string,
  run: (url: string) => Promise<void>
): Promise<void> {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/rss+xml" });
    res.end(xml);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no address");
  const url = `http://127.0.0.1:${addr.port}/feed.xml`;
  try {
    await run(url);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
  }
}

async function withServer(run: (url: string) => Promise<void>): Promise<void> {
  return withServerXml(RSS_XML, run);
}

describe("native lib.rss", () => {
  it("extracts feed metadata", async () => {
    await withServer(async (url) => {
      const out = await new ExtractFeedMetadataLibNode({ url }).process();
      expect(out.output).toMatchObject({
        title: "Example Feed",
        description: "Example Desc",
        link: "https://example.com",
        language: "en-us",
        generator: "testgen",
        entry_count: 2
      });
    });
  });

  it("streams feed items", async () => {
    await withServer(async (url) => {
      const node = new FetchRSSFeedLibNode();
      const rows: Array<Record<string, unknown>> = [];
      node.assign({ url });
      for await (const item of node.genProcess()) {
        if ("items" in item) continue; // skip final list yield
        rows.push(item);
      }
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({
        title: "Item One",
        link: "https://example.com/1",
        summary: "Summary One",
        author: "alice"
      });
      expect(typeof (rows[0].published as Record<string, unknown>).year).toBe(
        "number"
      );
    });
  });

  it("parses Atom entries: link from href and author from <name>", async () => {
    await withServerXml(ATOM_XML, async (url) => {
      const node = new FetchRSSFeedLibNode();
      node.assign({ url });
      const rows: Array<Record<string, unknown>> = [];
      for await (const item of node.genProcess()) {
        if ("items" in item) continue;
        rows.push(item);
      }
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        title: "Atom Item One",
        link: "https://example.com/atom-1",
        summary: "Atom Summary One",
        author: "Alice"
      });
    });
  });

  it("extracts Atom feed metadata", async () => {
    await withServerXml(ATOM_XML, async (url) => {
      const out = await new ExtractFeedMetadataLibNode({ url }).process();
      expect(out.output).toMatchObject({
        title: "Atom Example",
        description: "Atom Desc",
        entry_count: 1
      });
    });
  });
});
