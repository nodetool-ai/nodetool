import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import { runBridgeConformance } from './browser-bridge-conformance.mjs';
const modulePath = resolve(process.argv[2]);
const factory = (await import(pathToFileURL(modulePath).href)).default;
const wasmBinary = await readFile(resolve(dirname(modulePath), 'native-game.wasm'));
const module = await factory({ wasmBinary });
console.log(JSON.stringify(await runBridgeConformance(module)));
