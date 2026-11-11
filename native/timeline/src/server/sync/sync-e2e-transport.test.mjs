import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { countingTimelineProxy } from "./sync-e2e-transport.mjs";

test("counting proxy forwards only paths to its pinned loopback origin", async () => {
  const paths = [];
  const origin = http.createServer((request, response) => {
    paths.push(request.url); response.end("owned");
  });
  await new Promise(resolve => origin.listen(0, "127.0.0.1", resolve));
  const proxy = await countingTimelineProxy(`http://127.0.0.1:${origin.address().port}`);
  const request = target => new Promise((resolve, reject) => {
    const outgoing = http.request(proxy.url, { path: target }, response => {
      response.resume(); response.on("end", () => resolve(response.statusCode));
    });
    outgoing.on("error", reject); outgoing.end();
  });
  try {
    assert.equal(await request("http://example.invalid/trpc/timeline.get"), 400);
    assert.equal(await request("//example.invalid/trpc/timeline.get"), 400);
    assert.deepEqual(paths, []);
    assert.equal(await request("/trpc/timeline.get?input=one"), 200);
    assert.deepEqual(paths, ["/trpc/timeline.get?input=one"]);
    assert.equal(proxy.timelineGets(), 1);
  } finally {
    await proxy.close();
    origin.closeAllConnections();
    await new Promise(resolve => origin.close(resolve));
  }
});
