import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
const directory = resolve(process.argv[2]);
const fixture = new URL('./browser-bridge-conformance.mjs', import.meta.url);
const paths = new Map([
  ['/native-game.mjs', [resolve(directory, 'native-game.mjs'), 'text/javascript']],
  ['/native-game.wasm', [resolve(directory, 'native-game.wasm'), 'application/wasm']],
  ['/fixture.mjs', [fixture, 'text/javascript']],
]);
const server = createServer(async (request, response) => {
  if (request.url === '/') { response.end('<!doctype html><title>Native bridge conformance</title>'); return; }
  const entry = paths.get(request.url);
  if (!entry) { response.writeHead(404).end(); return; }
  try { response.setHeader('content-type', entry[1]); response.end(await readFile(entry[0])); }
  catch { response.writeHead(500).end(); }
});
await new Promise(resolveListening => server.listen(0, '127.0.0.1', resolveListening));
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const result = await page.evaluate(() => new Promise((resolveWorker, rejectWorker) => {
    const source = `import factory from '${location.origin}/native-game.mjs';
      import {runBridgeConformance} from '${location.origin}/fixture.mjs';
      try { const module=await factory({locateFile:path=>'${location.origin}/'+path});
        postMessage({ok:true,result:await runBridgeConformance(module)});
      }catch(error){postMessage({ok:false,error:String(error.stack||error)});}`;
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    const worker = new Worker(url, { type: 'module' });
    const timeout = setTimeout(() => { worker.terminate(); URL.revokeObjectURL(url); rejectWorker(new Error('Browser bridge watchdog expired')); }, 30000);
    worker.onmessage = ({ data }) => { clearTimeout(timeout); worker.terminate(); URL.revokeObjectURL(url); data.ok ? resolveWorker(data.result) : rejectWorker(new Error(data.error)); };
    worker.onerror = event => { clearTimeout(timeout); worker.terminate(); URL.revokeObjectURL(url); rejectWorker(new Error(event.message)); };
  }));
  console.log(JSON.stringify({ browser: 'chromium-worker', ...result }));
} finally { await browser?.close(); await new Promise(resolveClosed => server.close(resolveClosed)); }
