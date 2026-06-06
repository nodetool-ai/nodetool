import os from "node:os";

type SystemStatsSnapshot = {
  cpu_percent: number;
  memory_percent: number;
  memory_used: number;
  memory_total: number;
  memory_used_gb: number;
  memory_total_gb: number;
};

type CpuTimes = { total: number; idle: number };

const BYTES_PER_GB = 1024 ** 3;

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

/**
 * Build a stateful sampler that returns whole-system stats on each call.
 * CPU% is computed from the delta of `os.cpus()` times since the last call,
 * so the first call after construction returns ~0% (no delta yet).
 */
export function createSystemStatsSampler(): () => SystemStatsSnapshot {
  let previous = snapshotCpu();
  return () => {
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
      memory_total_gb: totalMem / BYTES_PER_GB
    };
  };
}
