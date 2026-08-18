import os from "node:os";
import { execFile } from "node:child_process";

type GpuStatsSnapshot = {
  gpu_percent: number;
  vram_total_gb: number;
  vram_used_gb: number;
  vram_percent: number;
};

type SystemStatsSnapshot = {
  cpu_percent: number;
  memory_percent: number;
  memory_used: number;
  memory_total: number;
  memory_used_gb: number;
  memory_total_gb: number;
} & Partial<GpuStatsSnapshot>;

type CpuTimes = { total: number; idle: number };

const BYTES_PER_GB = 1024 ** 3;
const MIB_PER_GB = 1024;

function snapshotCpu(): CpuTimes {
  let total = 0;
  let idle = 0;
  for (const cpu of os.cpus()) {
    const t = cpu.times;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
    idle += t.idle;
  }
  return { total, idle };
}

const NVIDIA_SMI_ARGS = [
  "--query-gpu=utilization.gpu,memory.total,memory.used",
  "--format=csv,noheader,nounits"
];

/**
 * Parse `nvidia-smi --query-gpu=utilization.gpu,memory.total,memory.used
 * --format=csv,noheader,nounits` output (one CSV line per GPU; utilization in
 * %, memory in MiB). With several GPUs, report the one with the most memory —
 * that's where models land, and a summed figure would suggest budgets no
 * single card has. Returns null when no line parses to a usable total.
 */
export function parseNvidiaSmiGpuStats(stdout: string): GpuStatsSnapshot | null {
  let best: { util: number; totalMib: number; usedMib: number } | null = null;
  for (const line of stdout.split("\n")) {
    const parts = line.split(",").map((part) => part.trim());
    if (parts.length < 3) {
      continue;
    }
    // Unsupported fields print "[N/A]"; Number() turns those into NaN.
    const util = Number(parts[0]);
    const totalMib = Number(parts[1]);
    const usedMib = Number(parts[2]);
    if (!Number.isFinite(totalMib) || totalMib <= 0) {
      continue;
    }
    if (!best || totalMib > best.totalMib) {
      best = {
        util: Number.isFinite(util) ? Math.max(0, Math.min(100, util)) : 0,
        totalMib,
        usedMib: Number.isFinite(usedMib) ? Math.max(0, usedMib) : 0
      };
    }
  }
  if (!best) {
    return null;
  }
  return {
    gpu_percent: best.util,
    vram_total_gb: best.totalMib / MIB_PER_GB,
    vram_used_gb: best.usedMib / MIB_PER_GB,
    vram_percent: Math.max(0, Math.min(100, (best.usedMib / best.totalMib) * 100))
  };
}

/**
 * Build a stateful sampler that returns whole-system stats on each call.
 * CPU% is computed from the delta of `os.cpus()` times since the last call,
 * so the first call after construction returns ~0% (no delta yet).
 *
 * GPU stats come from an async `nvidia-smi` probe kicked off by each call and
 * read from a cache, so the sampler itself stays synchronous; the first call
 * carries no GPU fields, later ones do. A machine without a working
 * `nvidia-smi` is marked unavailable after the first failed probe so no
 * further processes are spawned. (Apple Silicon has no discrete VRAM; the
 * frontend budgets against unified system memory instead.)
 */
export function createSystemStatsSampler(): () => SystemStatsSnapshot {
  let previous = snapshotCpu();
  let gpu: GpuStatsSnapshot | null = null;
  let gpuProbe: "idle" | "probing" | "unavailable" = "idle";

  const probeGpu = () => {
    gpuProbe = "probing";
    execFile("nvidia-smi", NVIDIA_SMI_ARGS, { timeout: 3000 }, (error, stdout) => {
      if (error) {
        gpuProbe = "unavailable";
        gpu = null;
        return;
      }
      gpu = parseNvidiaSmiGpuStats(stdout);
      gpuProbe = gpu ? "idle" : "unavailable";
    });
  };

  return () => {
    if (gpuProbe === "idle") {
      probeGpu();
    }
    const current = snapshotCpu();
    const totalDelta = current.total - previous.total;
    const idleDelta = current.idle - previous.idle;
    const cpuPercent =
      totalDelta > 0 ? (1 - idleDelta / totalDelta) * 100 : 0;
    previous = current;

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    return {
      cpu_percent: Math.max(0, Math.min(100, cpuPercent)),
      memory_percent: (usedMem / totalMem) * 100,
      memory_used: usedMem,
      memory_total: totalMem,
      memory_used_gb: usedMem / BYTES_PER_GB,
      memory_total_gb: totalMem / BYTES_PER_GB,
      ...(gpu ?? {})
    };
  };
}
