#!/usr/bin/env node

import { rmSync } from "node:fs";

// Clear both emitted files and incremental state so `tsc` re-emits outputs.
rmSync("dist", { recursive: true, force: true });
rmSync("tsconfig.tsbuildinfo", { force: true });
