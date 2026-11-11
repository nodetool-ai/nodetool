import { build } from 'esbuild';
await build({ entryPoints: [process.argv[3] ?? new URL('./webassembly-yoga.test.mjs', import.meta.url).pathname], outfile: process.argv[2], bundle: true, format: 'esm', platform: 'browser', target: 'es2022' });
