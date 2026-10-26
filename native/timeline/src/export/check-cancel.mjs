#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { root, bin, scratchBase } from './check-export.mjs';
const dir = fs.mkdtempSync(path.join(scratchBase, 'nt-export-cancel-'));
try {
  for (const format of ['mp4', 'webm', 'png_sequence', 'wav', 'mp3']) {
    for (const mode of ['cancel', 'alpha', 'error']) {
      if (mode === 'error' && format === 'png_sequence') continue;
      if (process.argv.includes('--no-render') && mode === 'cancel' && !['wav', 'mp3'].includes(format)) continue;
      const out = path.join(dir, `out.${format}`);
      const fixture = path.join(root, 'fixtures/av-sync.json');
      const extra = mode === 'cancel' ? ['--cancel-after-frames', '2'] : mode === 'alpha' ? ['--alpha'] : ['--video-encoder', 'missing-export-test-encoder', '--audio-encoder', 'missing-export-test-encoder'];
      const result = spawnSync(bin, [fixture, '--export', out, '--format', format, ...extra], {
        encoding: 'utf8'
      });
      assert.equal(result.error, undefined);
      assert.equal(result.signal, null, `Clean exit, not a crash: ${result.stderr}`);
      assert.notEqual(result.status, 0, `${mode} ${format} must not succeed`);
      assert.match(result.stderr, mode === 'alpha' ? /transparency.*unavailable/i : mode === 'cancel' ? /cancelled/i : /encoder/i);
      assert.ok(!fs.existsSync(out), 'No output');
      assert.deepEqual(fs.readdirSync(dir), [], 'No new temporary files or folders');
      console.log(`${mode} ${format}: PASS`);
    }
  }
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
