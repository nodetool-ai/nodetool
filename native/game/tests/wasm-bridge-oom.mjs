import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
const modulePath = resolve(process.argv[2]);
const factory = (await import(pathToFileURL(modulePath).href)).default;
const module = await factory({ wasmBinary: await readFile(resolve(dirname(modulePath), 'native-game.wasm')) });
const first = module._ng_create(), second = module._ng_create();
const request = new TextEncoder().encode(JSON.stringify({ protocolVersion: 1, requestId: 'allocation-failure', operation: 'hello', padding: 'x'.repeat(15 * 1024 * 1024) }));
const pointer = module._malloc(request.length);
module.HEAPU8.set(request, pointer);
const pressure = module._malloc(480 * 1024 * 1024);
if (!pressure) { throw new Error('OOM fixture could not reserve bounded pressure allocation'); }
try {
  if (module._ng_dispatch(first, pointer, request.length) !== 1) { throw new Error('Bridge allocation failure did not return structured error'); }
  const response = JSON.parse(new TextDecoder().decode(module.HEAPU8.slice(module._ng_response_pointer(first), module._ng_response_pointer(first) + module._ng_response_length(first))));
  if (response.error?.code !== 'resource_limit') { throw new Error(`Unexpected OOM response ${JSON.stringify(response)}`); }
} finally { module._free(pressure); module._free(pointer); }
const hello = new TextEncoder().encode(JSON.stringify({ protocolVersion: 1, requestId: 'survivor', operation: 'hello' }));
const survivor = module._malloc(hello.length);
module.HEAPU8.set(hello, survivor);
if (module._ng_dispatch(second, survivor, hello.length) !== 0) { throw new Error('Second context failed after pressure was released'); }
module._free(survivor);
module._ng_destroy(first);
module._ng_destroy(second);
console.log('Bridge allocator exhaustion returned resource_limit and preserved second context');
