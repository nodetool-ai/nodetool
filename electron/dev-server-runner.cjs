'use strict';
// Dev-mode entry point for Electron's utilityProcess.fork().
// tsx/esm is preloaded via NODE_OPTIONS --import by the caller (server.ts),
// so TypeScript files can be imported directly without calling register() here
// (register() would spawn a worker thread, which fails in utility processes).
const { pathToFileURL } = require('node:url');

import(pathToFileURL(process.argv[2]).href).catch(err => {
  process.stderr.write(String(err) + '\n');
  process.exit(1);
});
