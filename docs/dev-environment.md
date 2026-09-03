# Development environment gotchas

Two setups where a plain `npm install` or a plain test run does not work:
locked-down containers, and machines without a Vulkan driver. The everyday
setup is [AGENTS.md § Prerequisites](https://github.com/nodetool-ai/nodetool/blob/main/AGENTS.md#prerequisites).

### Install in sandboxed / proxied environments

Three postinstall steps break `npm install` in locked-down containers (CI
sandboxes, Claude Code on the web, proxied networks). A failed postinstall
makes npm roll back the **entire** `node_modules` tree, so one bad package
means no dependencies at all — including ESLint and the design-lint gate.

1. **`keytar` needs libsecret headers on Linux.** Without them node-gyp fails
   with `Package libsecret-1 was not found`. Fix first:
   `apt-get install -y libsecret-1-dev`.
2. **`electron` downloads its binary in postinstall.** Proxies that block the
   download (HTTP 403) fail the install. Skip it when you don't need to launch
   Electron: `ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm install`.
3. **`onnxruntime-node` downloads CUDA binaries from GitHub releases** in
   postinstall (it assumes CUDA when `nvcc` is absent). Same proxy failure
   mode, and there is no skip env var in our pinned version.

When only the JS toolchain matters (typecheck, lint, unit tests that don't hit
native modules), bypass all of the above in one step:

```bash
npm install --ignore-scripts --no-audit --no-fund
```

This skips every postinstall — including the root `better-sqlite3` rebuild —
so anything touching the database needs `npm run rebuild:native` afterwards
(which will still require the downloads above to have succeeded).

### WebGPU on a headless machine

The image nodes are shader-backed: every `lib.image.*` generator and every
`nodetool.image` transform reaches WebGPU through Dawn. On a machine with no
Vulkan driver they fail with:

```
No WebGPU adapter available (Node/Dawn). On headless Linux this usually means
no Vulkan driver (ICD) is installed — Dawn has no software fallback of its own.
```

**This is an environment gap, not a broken test and not an unsupported
platform.** CI already solves it: the `test-packages-*` shards of
`.github/workflows/quality-checks.yml` and the browser job in `test.yml` both
install `mesa-vulkan-drivers`, which ships **lavapipe** — a CPU Vulkan ICD. Do
not conclude from this error that shader-backed nodes cannot be tested, and do
not skip a test because your box hits it; the same test passes in CI.

With root:

```bash
apt-get install -y mesa-vulkan-drivers
```

Without root (sandboxes, dev containers), extract the driver and point the
Vulkan loader at it. `libvulkan1` — the loader — is usually already present;
only the ICD is missing:

```bash
apt-get download mesa-vulkan-drivers
dpkg-deb -x mesa-vulkan-drivers_*.deb /tmp/vk
# The shipped manifest names the library relatively, so rewrite it absolutely:
python3 - <<'PY'
import json
p = "/tmp/vk/usr/share/vulkan/icd.d/lvp_icd.json"
d = json.load(open(p))
d["ICD"]["library_path"] = "/tmp/vk/usr/lib/x86_64-linux-gnu/libvulkan_lvp.so"
json.dump(d, open("/tmp/vk/lvp_icd.json", "w"))
PY
export VK_DRIVER_FILES=/tmp/vk/lvp_icd.json
```

Then run the tests as usual. Lavapipe is a software rasterizer, so it is slow
but exact — pixel comparisons (`nodetool.compare.CompareImages`) are
reproducible under it, which is what
`packages/base-nodes/tests/image-examples-run.test.ts` relies on.
