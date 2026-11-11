import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { toolForCapabilityName } from '../../dist/capabilities/lazy-tool.js';

// Exercise the real capability behind loopback HTTP, with persistence isolated.
// This is a contention harness, not the complete production API bootstrap.
const args = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const context = { userId: 'qualification', hasModelInterface: name => name === 'createAsset', createAsset: async () => ({ id: 'qualification-output' }) };
const preview = toolForCapabilityName('preview_timeline_frame');
const server = createServer(async (req, res) => {
  try {
    const result = req.url === '/preview' ? await preview.process(context, args) : { ok: true };
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(result));
  } catch (error) { res.statusCode = 500; res.end(String(error)); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
try {
  for (const count of [0, 2, 4]) {
    const start = performance.now();
    let done = count === 0;
    const previews = Promise.all(Array.from({ length: count }, async () => {
      const result = await (await fetch(`${url}/preview`)).json();
      if (!result.complete) throw new Error(JSON.stringify(result));
      return performance.now() - start;
    })).then(times => { done = true; return times; });
    const pingMs = [];
    do {
      const ping = performance.now();
      await (await fetch(`${url}/health`)).json();
      pingMs.push(performance.now() - ping);
      await new Promise(resolve => setTimeout(resolve, 10));
    } while (!done || pingMs.length < 20);
    const completionMs = await previews;
    pingMs.sort((a, b) => a - b);
    console.log(JSON.stringify({ count, completionMs, pingCount: pingMs.length, pingP50Ms: pingMs[Math.floor(pingMs.length / 2)], pingP95Ms: pingMs[Math.floor(pingMs.length * .95)], pingMaxMs: pingMs.at(-1) }));
  }
} finally { await new Promise(resolve => server.close(resolve)); }
