import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const url = process.argv[2];
const args = JSON.parse(readFileSync(process.argv[3], 'utf8'));
const client = new Client({ name: 'preview-qualification', version: '1' });
await client.connect(new StreamableHTTPClientTransport(new URL(`${url}/mcp`)));
try {
  for (const count of [0, 2, 4]) {
    let done = count === 0;
    const start = performance.now();
    const calls = Promise.all(Array.from({ length: count }, async () => {
      const result = await client.callTool({ name: 'execute_code', arguments: { title: 'Qualify timeline preview', risk: 'low', code: `const result = await nodetool.timelines.preview(${JSON.stringify(args.document)}, ${JSON.stringify(args)}); return { qualificationComplete: result.complete, error: result.error };` } });
      if (result.isError || !/qualificationComplete[\s\S]{0,10}true/.test(JSON.stringify(result))) throw new Error(JSON.stringify(result));
      return performance.now() - start;
    })).then(times => { done = true; return times; });
    const pingMs = [];
    do {
      const ping = performance.now();
      const response = await fetch(`${url}/health`);
      if (!response.ok) throw new Error(`health: ${response.status}`);
      await response.text();
      pingMs.push(performance.now() - ping);
      await new Promise(resolve => setTimeout(resolve, 10));
    } while (!done || pingMs.length < 20);
    const completionMs = await calls;
    pingMs.sort((a, b) => a - b);
    console.log(JSON.stringify({ count, completionMs, pingCount: pingMs.length, pingP95Ms: pingMs[Math.floor(pingMs.length * .95)], pingMaxMs: pingMs.at(-1) }));
  }
} finally { await client.close(); }
