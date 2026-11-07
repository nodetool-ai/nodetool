import { fork } from 'node:child_process';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
if (!process.send) {
  const child = fork(fileURLToPath(import.meta.url), process.argv.slice(2), {
    stdio: ['ignore', 'ignore', 'inherit', 'ipc']
  });
  let result;
  const deadline = setTimeout(() => child.kill('SIGKILL'), 10_000);
  child.on('message', (message) => { result = message; child.kill('SIGTERM'); });
  child.on('error', (error) => { throw error; });
  child.on('exit', () => {
    clearTimeout(deadline);
    if (!result) throw new Error('Runtime probe did not finish');
    console.log(JSON.stringify(result));
  });
} else {
  if (process.argv.includes('--missing-addon')) {
    registerHooks({ resolve(specifier, context, nextResolve) {
      if (specifier === 'webgpu') throw new Error('webgpu deliberately omitted');
      return nextResolve(specifier, context);
    } });
  }
  const { getNodeGPUDevice } = await import('@nodetool-ai/gpu/node');
  try {
    await getNodeGPUDevice();
    process.send({ ok: true });
  } catch (error) {
    process.send({ ok: false, error: error.message });
  }
}
