/**
 * firecracker-pool.ts
 *
 * Pre-booted VM pool for low-latency code execution with Firecracker.
 *
 * Instead of booting a fresh VM for every code execution (which adds ~125ms+
 * boot time plus guest agent startup), the pool keeps a configurable number
 * of VMs pre-booted and ready. The runner acquires a VM from the pool,
 * executes code, then releases the VM back (or destroys it if tainted).
 */

import { FirecrackerVM } from "./firecracker-vm.js";
import type { FirecrackerPoolConfig, FirecrackerVMConfig } from "./firecracker-types.js";

// ---------------------------------------------------------------------------
// FirecrackerPool
// ---------------------------------------------------------------------------

/**
 * Maintains a pool of pre-booted Firecracker microVMs.
 *
 * @example
 * ```ts
 * const pool = new FirecrackerPool({
 *   vmConfig: {
 *     kernelImagePath: "/opt/fc/vmlinux",
 *     rootfsPath: "/opt/fc/rootfs.ext4",
 *   },
 *   poolSize: 3,
 * });
 *
 * await pool.warmup();
 *
 * // Used by FirecrackerRunner.setPool(pool) or manually:
 * const vm = await pool.acquire();
 * try {
 *   const sock = await vm.connectVsock(1024);
 *   // ... use sock ...
 * } finally {
 *   pool.release(vm);
 * }
 *
 * await pool.drain(); // cleanup on shutdown
 * ```
 */
export class FirecrackerPool {
  public readonly vmConfig: Readonly<FirecrackerVMConfig>;
  public readonly firecrackerBin: string;
  public readonly poolSize: number;
  public readonly maxVms: number;

  private readonly _ready: FirecrackerVM[] = [];
  private readonly _inUse = new Set<FirecrackerVM>();
  private _draining = false;
  private _warmingUp = false;

  constructor(config: FirecrackerPoolConfig) {
    this.vmConfig = Object.freeze({ ...config.vmConfig });
    this.firecrackerBin = config.firecrackerBin ?? "firecracker";
    this.poolSize = config.poolSize ?? 2;
    this.maxVms = config.maxVms ?? 10;
  }

  /** Number of VMs currently ready in the pool. */
  get readyCount(): number {
    return this._ready.length;
  }

  /** Number of VMs currently in use. */
  get inUseCount(): number {
    return this._inUse.size;
  }

  /** Total VMs managed (ready + in use). */
  get totalCount(): number {
    return this._ready.length + this._inUse.size;
  }

  /**
   * Pre-boot VMs up to `poolSize`.
   *
   * Boots VMs concurrently. If some fail to boot, the pool continues with
   * however many succeeded. Call this during application startup.
   *
   * @param count Override the number of VMs to boot (default: poolSize).
   */
  async warmup(count?: number): Promise<void> {
    if (this._draining) {
      throw new Error("Pool is draining");
    }
    this._warmingUp = true;

    const target = Math.min(count ?? this.poolSize, this.maxVms);
    const needed = Math.max(0, target - this.totalCount);

    const bootPromises: Promise<void>[] = [];
    for (let i = 0; i < needed; i++) {
      bootPromises.push(this._bootAndEnqueue());
    }

    // Wait for all boot attempts (don't fail on individual failures)
    const results = await Promise.allSettled(bootPromises);

    this._warmingUp = false;

    // Report if any failed
    const failures = results.filter((r) => r.status === "rejected");
    if (failures.length > 0 && failures.length === needed) {
      throw new Error(
        `All ${needed} VM boot attempts failed during warmup. ` +
          `First error: ${(failures[0] as PromiseRejectedResult).reason}`
      );
    }
  }

  /**
   * Acquire a ready VM from the pool.
   *
   * If no VMs are available, boots a new one on the fly (if under maxVms).
   * Throws if the pool is draining or at capacity.
   */
  async acquire(): Promise<FirecrackerVM> {
    if (this._draining) {
      throw new Error("Pool is draining");
    }

    // Try to get a ready VM
    const vm = this._ready.shift();
    if (vm) {
      this._inUse.add(vm);
      // Replenish the pool in the background
      void this._replenish();
      return vm;
    }

    // No ready VM — boot one on demand if under capacity
    if (this.totalCount < this.maxVms) {
      const newVm = new FirecrackerVM(this.vmConfig, this.firecrackerBin);
      await newVm.boot();
      this._inUse.add(newVm);
      // Replenish the pool in the background
      void this._replenish();
      return newVm;
    }

    throw new Error(
      `Pool at capacity (${this.maxVms} VMs). No VMs available.`
    );
  }

  /**
   * Release a VM back to the pool or destroy it.
   *
   * If the VM is still healthy and the pool has room, it goes back to the
   * ready queue. Otherwise it is destroyed.
   */
  release(vm: FirecrackerVM): void {
    this._inUse.delete(vm);

    if (this._draining || vm.isDestroyed || !vm.isRunning) {
      // VM is no longer usable — destroy it
      void vm.destroy();
      return;
    }

    if (this._ready.length < this.poolSize) {
      this._ready.push(vm);
    } else {
      // Pool is full — destroy the excess VM
      void vm.destroy();
    }
  }

  /**
   * Drain the pool: destroy all VMs (ready and in-use) and prevent
   * new acquisitions. Call this during application shutdown.
   */
  async drain(): Promise<void> {
    this._draining = true;

    // Destroy all ready VMs
    const destroyPromises: Promise<void>[] = [];
    while (this._ready.length > 0) {
      const vm = this._ready.shift()!;
      destroyPromises.push(vm.destroy());
    }

    // Destroy all in-use VMs
    for (const vm of this._inUse) {
      destroyPromises.push(vm.destroy());
    }
    this._inUse.clear();

    await Promise.allSettled(destroyPromises);
  }

  // ---- Private -----------------------------------------------------------

  /**
   * Boot a single VM and add it to the ready queue.
   */
  private async _bootAndEnqueue(): Promise<void> {
    const vm = new FirecrackerVM(this.vmConfig, this.firecrackerBin);
    await vm.boot();

    if (this._draining) {
      await vm.destroy();
      return;
    }

    this._ready.push(vm);
  }

  /**
   * Replenish the ready queue up to poolSize in the background.
   * Errors are silently ignored — the pool will try again on the next release.
   */
  private async _replenish(): Promise<void> {
    if (this._draining || this._warmingUp) {
      return;
    }

    while (
      this._ready.length < this.poolSize &&
      this.totalCount < this.maxVms
    ) {
      try {
        await this._bootAndEnqueue();
      } catch {
        // Failed to boot a replenishment VM — not critical
        break;
      }
    }
  }
}
