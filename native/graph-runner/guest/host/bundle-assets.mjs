// Resources guest/build.mjs keeps out of the bundle (bundle-assets-build.mjs),
// read from `__host.bundleAssets` when a module first needs them.
function host(name) {
  const assets = globalThis.__host?.bundleAssets;
  if (!assets?.available()) {
    throw new Error(`bundle asset ${name}: the runner has no bundle assets directory (<bundle>.assets next to the bundle)`);
  }
  return assets;
}

export function readBundleAsset(name) {
  return host(name).read(name);
}

export function readBundleText(name) {
  return host(name).readText(name);
}
