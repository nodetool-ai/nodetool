/**
 * Local Model Fit — Hardware Profile Presets
 *
 * A curated list of common hardware configurations that can be selected
 * by the user when auto-detection is not available or inaccurate.
 *
 * Each preset is a valid HardwareProfile with `detected: false`.
 */

import type { HardwareProfile } from "./types";

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export const HARDWARE_PRESETS: readonly HardwareProfile[] = [
  // ── High-end desktop GPUs ────────────────────────────────────────────
  { id: "rtx-4090",  label: "NVIDIA RTX 4090 (24 GB)",  vramGb: 24, ramGb: 32, platform: "windows", detected: false },
  { id: "rtx-4080",  label: "NVIDIA RTX 4080 (16 GB)",  vramGb: 16, ramGb: 32, platform: "windows", detected: false },
  { id: "rtx-4070ti",label: "NVIDIA RTX 4070 Ti (12 GB)",vramGb: 12, ramGb: 32, platform: "windows", detected: false },
  { id: "rtx-3090",  label: "NVIDIA RTX 3090 (24 GB)",  vramGb: 24, ramGb: 32, platform: "windows", detected: false },
  { id: "rtx-3080",  label: "NVIDIA RTX 3080 (10 GB)",  vramGb: 10, ramGb: 32, platform: "windows", detected: false },
  { id: "rtx-3070",  label: "NVIDIA RTX 3070 (8 GB)",   vramGb: 8,  ramGb: 16, platform: "windows", detected: false },
  { id: "rtx-3060",  label: "NVIDIA RTX 3060 (12 GB)",  vramGb: 12, ramGb: 16, platform: "windows", detected: false },

  // ── Apple Silicon ────────────────────────────────────────────────────
  { id: "m1-8gb",    label: "Apple M1 (8 GB unified)",  vramGb: 0, ramGb: 8,   platform: "macos", detected: false },
  { id: "m1-16gb",   label: "Apple M1 (16 GB unified)", vramGb: 0, ramGb: 16,  platform: "macos", detected: false },
  { id: "m2-8gb",    label: "Apple M2 (8 GB unified)",  vramGb: 0, ramGb: 8,   platform: "macos", detected: false },
  { id: "m2-16gb",   label: "Apple M2 (16 GB unified)", vramGb: 0, ramGb: 16,  platform: "macos", detected: false },
  { id: "m2-24gb",   label: "Apple M2 Pro (24 GB unified)", vramGb: 0, ramGb: 24, platform: "macos", detected: false },
  { id: "m3-8gb",    label: "Apple M3 (8 GB unified)",  vramGb: 0, ramGb: 8,   platform: "macos", detected: false },
  { id: "m3-18gb",   label: "Apple M3 Pro (18 GB unified)", vramGb: 0, ramGb: 18, platform: "macos", detected: false },
  { id: "m3-36gb",   label: "Apple M3 Max (36 GB unified)", vramGb: 0, ramGb: 36, platform: "macos", detected: false },
  { id: "m4-16gb",   label: "Apple M4 (16 GB unified)", vramGb: 0, ramGb: 16,  platform: "macos", detected: false },
  { id: "m4-24gb",   label: "Apple M4 Pro (24 GB unified)", vramGb: 0, ramGb: 24, platform: "macos", detected: false },
  { id: "m4-48gb",   label: "Apple M4 Max (48 GB unified)", vramGb: 0, ramGb: 48, platform: "macos", detected: false },

  // ── CPU-only / integrated ────────────────────────────────────────────
  { id: "cpu-8gb",   label: "CPU only (8 GB RAM)",      vramGb: 0, ramGb: 8,   platform: "unknown", detected: false },
  { id: "cpu-16gb",  label: "CPU only (16 GB RAM)",     vramGb: 0, ramGb: 16,  platform: "unknown", detected: false },
  { id: "cpu-32gb",  label: "CPU only (32 GB RAM)",     vramGb: 0, ramGb: 32,  platform: "unknown", detected: false },
  { id: "cpu-64gb",  label: "CPU only (64 GB RAM)",     vramGb: 0, ramGb: 64,  platform: "unknown", detected: false },
] as const;

/** Lookup a preset by id. */
export const getHardwarePreset = (id: string): HardwareProfile | undefined =>
  HARDWARE_PRESETS.find((p) => p.id === id);

/**
 * Build a custom HardwareProfile for manual VRAM/RAM overrides.
 */
export const buildCustomProfile = (
  vramGb: number,
  ramGb: number,
  platform: HardwareProfile["platform"] = "unknown"
): HardwareProfile => ({
  id: "custom",
  label: vramGb > 0
    ? `Custom (${vramGb} GB VRAM, ${ramGb} GB RAM)`
    : `Custom (${ramGb} GB RAM)`,
  vramGb,
  ramGb,
  platform,
  detected: false,
});
