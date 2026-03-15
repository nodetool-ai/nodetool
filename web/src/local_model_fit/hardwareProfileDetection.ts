/**
 * Local Model Fit — Hardware Profile Detection
 *
 * Best-effort browser-side detection of the user's hardware capabilities.
 * In order of precision:
 *   1. WebGPU adapter info  (device name, VRAM limits)
 *   2. navigator.deviceMemory (Chrome only, coarse)
 *   3. navigator.platform / userAgent heuristics
 *
 * The detected profile is always approximate — the user can override it.
 */

import type { HardwareProfile } from "./types";

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

const detectPlatform = (): HardwareProfile["platform"] => {
  if (typeof navigator === "undefined") {
    return "unknown";
  }
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) { return "macos"; }
  if (ua.includes("win")) { return "windows"; }
  if (ua.includes("linux")) { return "linux"; }
  return "browser";
};

// ---------------------------------------------------------------------------
// RAM estimate
// ---------------------------------------------------------------------------

/** navigator.deviceMemory is Chrome-only and rounds to power-of-2 buckets. */
const estimateRamGb = (): number => {
  if (typeof navigator !== "undefined" && "deviceMemory" in navigator) {
    return (navigator as { deviceMemory?: number }).deviceMemory ?? 8;
  }
  // Fallback: assume 8 GB — conservative but safe.
  return 8;
};

// ---------------------------------------------------------------------------
// WebGPU detection
// ---------------------------------------------------------------------------

interface GpuProbe {
  adapterName: string;
  vramEstimateGb: number;
}

/**
 * Attempt to request a WebGPU adapter and read its info.
 * Returns null when WebGPU is unavailable.
 */
const probeWebGpu = async (): Promise<GpuProbe | null> => {
  if (typeof navigator === "undefined" || !("gpu" in navigator)) {
    return null;
  }
  try {
    const gpu = (navigator as { gpu: GPU }).gpu;
    const adapter = await gpu.requestAdapter();
    if (!adapter) { return null; }
    const info = adapter.info;
    const adapterName =
      (info as { device?: string }).device ??
      (info as { description?: string }).description ??
      "Unknown GPU";

    // maxBufferSize is the best proxy we have for usable VRAM via WebGPU.
    const limits = adapter.limits;
    const maxBuf = limits.maxBufferSize ?? 0;
    // Convert bytes → GB, rough floor.
    const vramEstimateGb = maxBuf > 0 ? Math.floor(maxBuf / (1024 ** 3)) : 0;

    return { adapterName, vramEstimateGb };
  } catch {
    // WebGPU not available or blocked.
    return null;
  }
};

// ---------------------------------------------------------------------------
// Apple-silicon heuristic
// ---------------------------------------------------------------------------

/**
 * On macOS, VRAM = 0 (unified memory) and the usable allocation for ML
 * is ≈ 75 % of total RAM.  We leave the profile's `vramGb` at 0 and rely
 * on RAM in the scoring engine to handle Apple Silicon correctly.
 */

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect the current hardware as best we can from the browser.
 *
 * This function is async because WebGPU adapter requests are async.
 * It never throws — on failure it returns a conservative fallback.
 */
export const detectHardwareProfile = async (): Promise<HardwareProfile> => {
  const platform = detectPlatform();
  const ramGb = estimateRamGb();
  const gpu = await probeWebGpu();

  const vramGb = gpu?.vramEstimateGb ?? 0;
  const gpuLabel = gpu?.adapterName ?? "";

  const label = gpuLabel
    ? `${gpuLabel} (detected)`
    : platform === "macos"
      ? `macOS (${ramGb} GB unified, detected)`
      : `${platform} (${ramGb} GB RAM, detected)`;

  return {
    id: "detected",
    label,
    vramGb,
    ramGb,
    platform,
    detected: true,
  };
};
