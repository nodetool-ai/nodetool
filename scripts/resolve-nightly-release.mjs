#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function flag(name) {
  return process.argv.includes(`--${name}`);
}

function baseVersion(version) {
  const stable = version.replace(/[-+].*$/, "");
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(stable);
  if (!match) throw new Error(`Invalid version '${version}'`);
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

const root = path.resolve(arg("root") ?? process.cwd());
const date = arg("date");
const runNumber = arg("run-number");
const sha = arg("sha") ?? "";
if (!/^\d{8}$/.test(date ?? "")) throw new Error("--date must be YYYYMMDD");
if (!/^\d+$/.test(runNumber ?? "")) throw new Error("--run-number must be numeric");
if (!/^[0-9a-f]{7,40}$/i.test(sha)) throw new Error("--sha must be a git SHA");

const pkg = JSON.parse(fs.readFileSync(path.join(root, "electron", "package.json"), "utf8"));
const targetBase = baseVersion(pkg.version);
const version = `${targetBase}-nightly.${date}.${runNumber}`;
const shortSha = sha.slice(0, 12);
const entries = {
  base_version: targetBase,
  version,
  tag: `v${version}`,
  name: `Nodetool Nightly ${version} (${shortSha})`,
  short_sha: shortSha,
};

const output = Object.entries(entries).map(([key, value]) => `${key}=${value}\n`).join("");
if (flag("github-output")) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, output);
} else {
  process.stdout.write(output);
}
