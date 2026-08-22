#!/usr/bin/env node
/**
 * Live provider contract probe (docs/failure-mode-roadmap.md §6).
 *
 * Makes one request per manifest entry that declares a live probe, decodes the
 * response with the production decoder, and reports schema failures apart from
 * network failures. Old cassettes cannot notice a provider that changed its
 * response today; this can.
 *
 * Usage:
 *   node scripts/provider-contract-probe.mjs [--json] [--out report.json]
 *                                            [--only <id>] [--strict-network]
 *
 * Requires `npm run build:packages` first. Entries whose credential is unset
 * are skipped, so a run with no keys is a no-op rather than a failure.
 *
 * Exit codes: 0 clean, 2 a schema failure (the contract broke), 3 a network
 * failure under --strict-network.
 */

import { writeFileSync } from "node:fs";
import {
  PROBE_MANIFEST,
  runProbes,
  formatProbeReport
} from "@nodetool-ai/runtime";

function parseArgs(argv) {
  const args = { json: false, out: null, only: [], strictNetwork: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") args.json = true;
    else if (arg === "--strict-network") args.strictNetwork = true;
    else if (arg === "--out") args.out = argv[++i];
    else if (arg === "--only") args.only.push(argv[++i]);
    else if (arg === "--help" || arg === "-h") {
      console.log(
        "usage: provider-contract-probe.mjs [--json] [--out <file>] " +
          "[--only <entry-id>] [--strict-network]"
      );
      process.exit(0);
    } else {
      console.error(`unknown argument: ${arg}`);
      process.exit(64);
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const entries = args.only.length
  ? PROBE_MANIFEST.filter((entry) => args.only.includes(entry.id))
  : PROBE_MANIFEST;

if (entries.length === 0) {
  console.error(`no manifest entry matched: ${args.only.join(", ")}`);
  process.exit(64);
}

const report = await runProbes({ entries, env: process.env });

if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(formatProbeReport(report));
}
if (args.out) {
  // The report holds shapes and redacted messages only — safe to upload.
  writeFileSync(args.out, `${JSON.stringify(report, null, 2)}\n`);
}

if (report.totals.schemaFailures > 0) process.exit(2);
if (args.strictNetwork && report.totals.networkFailures > 0) process.exit(3);
