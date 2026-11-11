import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const started = performance.now();
const child = fork(fileURLToPath(new URL('./shared-preview-completion.mjs', import.meta.url)), {
  stdio: ['ignore', 'ignore', 'inherit', 'ipc']
});
let result;
const deadline = setTimeout(() => child.kill('SIGKILL'), 10_000);
child.on('message', (message) => {
  result = message;
  child.kill('SIGTERM');
});
child.on('error', (error) => { throw error; });
child.on('exit', (code, signal) => {
  clearTimeout(deadline);
  if (!result || signal !== 'SIGTERM') {
    throw new Error(`Render child failed: code=${code}, signal=${signal}`);
  }
  console.log(JSON.stringify({ ...result, completionMs: performance.now() - started, signal }));
});
