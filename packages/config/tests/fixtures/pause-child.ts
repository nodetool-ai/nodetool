/**
 * A child process for the pause harness test: writes `first`, reaches the
 * step "between", then writes `second`. Run with the directory as argument.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pausePoint } from "@nodetool-ai/config/pause-points";

const dir = process.argv[2];
if (!dir) throw new Error("Pass the output directory");
writeFileSync(join(dir, "first"), "1");
await pausePoint("between");
writeFileSync(join(dir, "second"), "2");
