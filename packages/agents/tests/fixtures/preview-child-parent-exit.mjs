import { fork } from 'node:child_process';
const child = fork(new URL('../../src/timeline-preview/render-child.ts', import.meta.url), {
  execArgv: ['--import', 'tsx'], stdio: ['ignore', 'ignore', 'ignore', 'ipc']
});
console.log(child.pid);
child.disconnect();
child.unref();
