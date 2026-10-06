#!/usr/bin/env node
/** Entry point Chrome launches through the native messaging manifest. */
import { runNativeHost } from "./native-host.js";

runNativeHost().catch((error) => {
  process.stderr.write(`nodetool native host failed: ${String(error)}\n`);
  process.exit(1);
});
