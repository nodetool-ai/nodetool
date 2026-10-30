#!/usr/bin/env node
import { run } from "./index.js";
void run().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
