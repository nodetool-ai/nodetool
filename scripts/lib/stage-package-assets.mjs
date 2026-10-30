import { existsSync } from 'node:fs';
import { copyFile } from 'node:fs/promises';
import path from 'node:path';

/** Stage registered assets, preserving explicit absence of native capabilities. */
export async function stagePackageAssets(assets, destination, resolveRoot, log = () => {}) {
  const staged = new Map();
  for (const asset of assets) {
    const packageRoot = resolveRoot(asset.pkg);
    if (!packageRoot) { throw new Error(`Registered asset package not found: ${asset.pkg}`); }
    const source = path.join(packageRoot, 'dist', asset.path);
    if (!existsSync(source)) {
      if (asset.optional) { log(`Native capability unavailable: ${asset.pkg}/${asset.path}`); continue; }
      throw new Error(`Registered asset missing from build output: ${source} (${asset.pkg}/${asset.path})`);
    }
    const basename = path.basename(asset.path);
    const existing = staged.get(basename);
    if (existing && existing !== source) { throw new Error(`Asset basename collision: ${basename}`); }
    await copyFile(source, path.join(destination, basename));
    staged.set(basename, source);
    log(`Staged ${basename} (from ${asset.pkg}/dist/${asset.path})`);
  }
  return staged;
}
