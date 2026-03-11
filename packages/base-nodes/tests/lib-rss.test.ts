import { describe, expect, it } from "vitest";
import http from "node:http";
import { FetchRSSFeedLibNode, ExtractFeedMetadataLibNode } from "../src/index.js";

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

async function withServer(run: (url: string) => Promise<void>): Promise<void> {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/rss+xml" });
    res.end(RSS_XML);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no address");
  const url = `http://127.0.0.1:${addr.port}/feed.xml`;
  try {
    await run(url);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

describe("native lib.rss", () => {
  it("extracts feed metadata", async () => {
    await withServer(async (url) => {
      const out = await new ExtractFeedMetadataLibNode().process({ url });
      expect(out.output).toMatchObject({
        title: "Example Feed",
        description: "Example Desc",
        link: "https://example.com",
        language: "en-us",
        generator: "testgen",
        entry_count: 2,
      });
    });
  });

  it("streams feed items", async () => {
    await withServer(async (url) => {
      const node = new FetchRSSFeedLibNode();
      const rows: Array<Record<string, unknown>> = [];
      for await (const item of node.genProcess({ url })) {
        rows.push(item);
      }
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({
        title: "Item One",
        link: "https://example.com/1",
        summary: "Summary One",
        author: "alice",
      });
      expect(typeof (rows[0].published as Record<string, unknown>).year).toBe("number");
    });
  });
});
