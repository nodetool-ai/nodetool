import { describe, expect, it } from "vitest";
import http from "node:http";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  GetRequestLibNode,
  JSONPostRequestLibNode,
  DownloadFilesLibNode,
  RectLibNode,
  DocumentLibNode,
  SVGToImageLibNode,
} from "../../src/index.js";

async function withServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
  run: (baseUrl: string) => Promise<void>
): Promise<void> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Could not bind test server");
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

describe("native lib.http", () => {
  it("handles text and json requests", async () => {
    await withServer((req, res) => {
      if (req.method === "GET" && req.url === "/text") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("hello-http");
        return;
      }
      if (req.method === "POST" && req.url === "/json") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      res.writeHead(404);
      res.end();
    }, async (baseUrl) => {
      await expect(new GetRequestLibNode().process({ url: `${baseUrl}/text` })).resolves.toEqual({
        output: "hello-http",
      });
      await expect(
        new JSONPostRequestLibNode().process({ url: `${baseUrl}/json`, data: { a: 1 } })
      ).resolves.toEqual({ output: { ok: true } });
    });
  });

  it("downloads files", async () => {
    await withServer((req, res) => {
      if (req.url === "/file.txt") {
        res.writeHead(200, {
          "Content-Type": "text/plain",
          "Content-Disposition": 'attachment; filename="file.txt"',
        });
        res.end("content");
        return;
      }
      res.writeHead(404);
      res.end();
    }, async (baseUrl) => {
      const dir = await mkdtemp(join(tmpdir(), "nt-lib-http-"));
      const out = await new DownloadFilesLibNode().process({
        urls: [`${baseUrl}/file.txt`],
        output_folder: dir,
      });
      expect(out.success).toHaveLength(1);
      expect(String((out.success as string[])[0])).toContain("file.txt");
      expect(out.failed).toEqual([]);
    });
  });
});

describe("native lib.svg", () => {
  it("builds svg elements and documents", async () => {
    const rect = await new RectLibNode().process({ x: 1, y: 2, width: 3, height: 4 });
    expect((rect.output as { name: string }).name).toBe("rect");

    const doc = await new DocumentLibNode().process({
      content: rect.output,
      width: 100,
      height: 50,
      viewBox: "0 0 100 50",
    });
    const decoded = Buffer.from(String((doc.output as { data: string }).data), "base64").toString("utf-8");
    expect(decoded).toContain("<svg");
    expect(decoded).toContain("<rect");

    const image = await new SVGToImageLibNode().process({ content: rect.output });
    expect((image.output as { mimeType: string }).mimeType).toBe("image/svg+xml");
  });
});
