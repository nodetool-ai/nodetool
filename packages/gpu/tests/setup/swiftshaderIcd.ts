/**
 * Vitest setup: make a CPU WebGPU device available so the GPU smoke tests run
 * in CI instead of skipping.
 *
 * Dawn's Vulkan backend needs an installed ICD (driver). The preferred CI
 * path is to install `mesa-vulkan-drivers` (provides lavapipe at
 * `/usr/share/vulkan/icd.d/lvp_icd.x86_64.json`); the Vulkan loader then
 * picks it up automatically and this shim is a no-op. As a fallback for
 * environments without a system ICD, we point the loader at Electron's
 * bundled SwiftShader via `VK_ICD_FILENAMES`/`VK_DRIVER_FILES` — but only if
 * Electron's binary was actually downloaded (CI sets
 * `ELECTRON_SKIP_BINARY_DOWNLOAD=1`, so this fallback is mostly useful for
 * local dev where the binary is present).
 *
 * This runs before each test file imports, so the env vars are set before Dawn
 * calls `vkCreateInstance` (inside the suites' top-level device acquisition).
 *
 * Guards:
 * - Never override an ICD the operator already chose (env already set).
 * - Never force CPU when a real system Vulkan driver is registered — only
 *   register SwiftShader when no `/usr/share/vulkan/icd.d` entry exists, so a
 *   GPU-equipped machine (or one with lavapipe installed) keeps its adapter.
 * - Test-only. Production (`src/node.ts`) keeps its no-silent-CPU-fallback
 *   contract; this never touches it.
 */
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const ICD_ENV_VARS = ["VK_ICD_FILENAMES", "VK_DRIVER_FILES"] as const;

function hasSystemVulkanDriver(): boolean {
  for (const dir of ["/usr/share/vulkan/icd.d", "/etc/vulkan/icd.d"]) {
    try {
      if (readdirSync(dir).some((f) => f.endsWith(".json"))) {
        return true;
      }
    } catch {
      // Directory absent — no driver registered there.
    }
  }
  return false;
}

function findSwiftShaderIcd(): string | undefined {
  const candidates: string[] = [];
  const require = createRequire(import.meta.url);
  try {
    const electronDist = join(
      dirname(require.resolve("electron/package.json")),
      "dist",
      "vk_swiftshader_icd.json"
    );
    candidates.push(electronDist);
  } catch {
    // electron not installed in this workspace — fall through to other paths.
  }
  return candidates.find((p) => existsSync(p));
}

if (
  !ICD_ENV_VARS.some((name) => process.env[name]) &&
  !hasSystemVulkanDriver()
) {
  const icd = findSwiftShaderIcd();
  if (icd) {
    for (const name of ICD_ENV_VARS) {
      process.env[name] = icd;
    }
  }
}
