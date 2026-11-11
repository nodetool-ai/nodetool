import { createRequire } from 'node:module';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
// Worktrees can use the main checkout's installed tooling without modifying it.
let require = createRequire(path.join(root, 'package.json'));
try { require.resolve('esbuild'); }
catch {
  const dotGit = path.join(root, '.git');
  const gitDir = statSync(dotGit).isDirectory() ? dotGit : path.resolve(root, readFileSync(dotGit,'utf8').trim().slice(8));
  const common = path.resolve(gitDir, readFileSync(path.join(gitDir,'commondir'),'utf8').trim());
  require = createRequire(path.join(path.dirname(common), 'package.json'));
}
export const { build } = require('esbuild');
