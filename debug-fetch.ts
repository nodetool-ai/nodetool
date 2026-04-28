import { listAllHfModels } from './packages/huggingface/src/hf-hub-search.js';
import { vi } from 'vitest';

async function run() {
  let call = 0;
  const fn = async () => {
    call += 1;
    if (call === 1) {
      return {
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        json: async () => ({}),
        text: async () => "boom"
      };
    }
    const body = [{ id: `owner/ok-${call}` }];
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => body,
      text: async () => JSON.stringify(body)
    };
  };
  (globalThis as any).fetch = fn;

  const results = await listAllHfModels({ limit: 3 });
  console.log('RESULTS:', results);
}
run();
