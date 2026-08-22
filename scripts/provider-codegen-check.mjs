#!/usr/bin/env node
/**
 * Provider codegen drift gate.
 *
 * Runs a provider generator in fixture mode — checked-in schema fixtures only,
 * no network, no pricing, no timestamps — into a temporary directory, then
 * compares the outputs the generator manifest declares against the expected
 * files checked in next to it. Any difference exits non-zero, so a change to a
 * generator or to a node template that moves generated metadata cannot land
 * unreviewed.
 *
 * Usage:
 *   node scripts/provider-codegen-check.mjs --provider fal [--strict]
 *   node scripts/provider-codegen-check.mjs --provider kie --write
 *
 * `--write` refreshes the expected outputs from the fixtures. `--strict` also
 * fails on an expected file that no manifest output declares.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const PROVIDERS = {
  fal: { packageDir: "packages/fal-codegen" },
  kie: { packageDir: "packages/kie-codegen" }
};

function parseArgv(argv) {
  const valueOf = (flag) =>
    argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined;
  return {
    provider: valueOf("--provider"),
    report: valueOf("--report"),
    strict: argv.includes("--strict"),
    write: argv.includes("--write")
  };
}

function listFiles(dir, base = dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full, base));
    else out.push(relative(base, full));
  }
  return out;
}

function generate(packageDir, outDir) {
  const result = spawnSync(
    "npx",
    ["tsx", "src/fixture-generate.ts", "--out", outDir],
    { cwd: join(ROOT, packageDir), encoding: "utf8" }
  );
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    throw new Error(`${packageDir}: fixture-mode generation failed`);
  }
  return result.stdout ?? "";
}

function main() {
  const { provider, report, strict, write } = parseArgv(process.argv.slice(2));
  const config = PROVIDERS[provider];
  if (!config) {
    console.error(
      `--provider must be one of: ${Object.keys(PROVIDERS).join(", ")}`
    );
    process.exit(2);
  }

  const fixturesDir = join(ROOT, config.packageDir, "fixtures");
  const expectedDir = join(fixturesDir, "expected");
  const manifest = JSON.parse(
    readFileSync(join(fixturesDir, "generator-manifest.json"), "utf8")
  );
  if (!Array.isArray(manifest.outputs) || manifest.outputs.length === 0) {
    console.error(`${provider}: the generator manifest declares no outputs`);
    process.exit(1);
  }

  const writeReport = (compared, ok, drifted) => {
    if (!report) return;
    writeFileSync(
      report,
      `${JSON.stringify({ provider, compared, ok, drifted }, null, 2)}\n`,
      "utf8"
    );
  };

  const outDir = mkdtempSync(join(tmpdir(), `nodetool-codegen-${provider}-`));
  try {
    generate(config.packageDir, outDir);

    const missing = [];
    const changed = [];
    let compared = 0;

    for (const output of manifest.outputs) {
      const generatedPath = join(outDir, output.path);
      let generated;
      try {
        generated = readFileSync(generatedPath, "utf8");
      } catch {
        console.error(
          `${provider}: fixture mode did not produce declared output ${output.path}`
        );
        process.exit(1);
      }

      const expectedPath = join(expectedDir, output.path);
      if (write) {
        mkdirSync(dirname(expectedPath), { recursive: true });
        writeFileSync(expectedPath, generated, "utf8");
        compared++;
        continue;
      }

      let expected;
      try {
        expected = readFileSync(expectedPath, "utf8");
      } catch {
        missing.push(output.path);
        continue;
      }
      compared++;
      if (expected !== generated) changed.push(output.path);
    }

    if (write) {
      console.log(
        `${provider}: wrote ${compared} expected output(s) to ${relative(ROOT, expectedDir)}`
      );
      return;
    }

    if (compared === 0) {
      writeReport(0, false, []);
      console.error(
        `${provider}: compared 0 files — the gate examined nothing.`
      );
      process.exit(1);
    }

    const declared = new Set(manifest.outputs.map((o) => o.path));
    const undeclared = listFiles(expectedDir).filter((f) => !declared.has(f));

    if (missing.length === 0 && changed.length === 0 && (!strict || undeclared.length === 0)) {
      writeReport(compared, true, []);
      console.log(
        `${provider}: ${compared} generated output(s) match the checked-in fixtures.`
      );
      if (undeclared.length > 0) {
        console.warn(
          `  ${undeclared.length} expected file(s) no manifest output declares: ${undeclared.join(", ")}`
        );
      }
      return;
    }

    writeReport(compared, false, [...missing, ...changed].sort());
    console.error(`\n${provider}: generated provider metadata drifted.`);
    for (const file of missing.sort()) console.error(`  missing:    ${file}`);
    for (const file of changed.sort()) console.error(`  changed:    ${file}`);
    if (strict) {
      for (const file of undeclared.sort()) {
        console.error(`  undeclared: ${file}`);
      }
    }
    console.error(
      `\nReview the diff. If the change is intended, run ` +
        `\`node scripts/provider-codegen-check.mjs --provider ${provider} --write\` and commit it.`
    );
    process.exit(1);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
