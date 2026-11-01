import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareReferenceCli, cleanupReferenceCli, importReference } from '../tracking/reference.mjs';
import { makeFixture, modes } from './fixture.mjs';
import { assertImportedTreatments } from '../pixels/oracle.mjs';
import { comparePairs } from '../../render2d/check-example-stills.mjs';

const binary = path.resolve(process.argv[2]);
const mode = process.argv[3] ?? "feather";
assert(modes.includes(mode));
const sha = () => createHash('sha256').update(fs.readFileSync(binary)).digest('hex');
const hash = sha();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const run = fs.mkdtempSync(path.join(root, 'build/motion-maskoutsets-'));
const repo = path.resolve(root, '../..');
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(run, 'node_modules'), 'dir');
const cli = prepareReferenceCli(run);
try {
  const document = makeFixture(mode);
  const file = path.join(run, 'input.json');
  const original = JSON.stringify(document);
  fs.writeFileSync(file, original);
  const web = path.join(run, 'web');
  importReference(file, [554], web, run, cli);
  assertImportedTreatments(document, JSON.parse(fs.readFileSync(path.join(web, 'input.imported.json'))));
  const native = path.join(run, 'native');
  execFileSync(binary, [file, '--stills', native, '--still-frames', '554', '--decode', 'sw'], { stdio: 'pipe', timeout: 180000 });
  assert.equal(fs.readFileSync(file, 'utf8'), original);
  assert.equal(sha(), hash);
  const result = comparePairs([554], path.join(web, 'stills'), native, 40);
  fs.writeFileSync(path.join(run, 'report.json'), JSON.stringify({ hash, mode, result }, null, 2));
  console.log(JSON.stringify({ run, hash, mode, result }));
  if (!result.pass) process.exitCode = 1;
} finally { cleanupReferenceCli(cli); }
