// Isolate the threads added by Dawn/device acquisition from encoder threads.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus, loadavg } from 'node:os';
import { getNodeGPUDevice } from '@nodetool-ai/gpu/node';

function snapshot() {
  const names = {};
  for (const id of readdirSync(`/proc/${process.pid}/task`)) {
    const name = readFileSync(`/proc/${process.pid}/task/${id}/comm`, 'utf8').trim();
    names[name] = (names[name] ?? 0) + 1;
  }
  return { names, count: Object.values(names).reduce((sum, n) => sum + n, 0), load: loadavg() };
}
const before = snapshot();
const device = await getNodeGPUDevice();
const info = device.adapterInfo;
writeFileSync(process.argv[2], JSON.stringify({ before, after: snapshot(),
  adapter: { vendor: info.vendor, device: info.device, description: info.description },
  cores: cpus().length, lpThreads: process.env.LP_NUM_THREADS ?? 'unset' }));
process.exit(0);
