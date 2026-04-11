/**
 * Tests for FirecrackerPool.
 *
 * Verifies constructor defaults, state tracking, and drain behavior.
 * Full integration tests require a Linux host with /dev/kvm.
 */
import { describe, it, expect } from "vitest";
import { FirecrackerPool } from "../src/firecracker-pool.js";

const baseConfig = {
  vmConfig: {
    kernelImagePath: "/opt/vmlinux",
    rootfsPath: "/opt/rootfs.ext4"
  }
};

describe("FirecrackerPool constructor", () => {
  it("stores vmConfig", () => {
    const pool = new FirecrackerPool(baseConfig);
    expect(pool.vmConfig.kernelImagePath).toBe("/opt/vmlinux");
    expect(pool.vmConfig.rootfsPath).toBe("/opt/rootfs.ext4");
  });

  it("freezes vmConfig", () => {
    const pool = new FirecrackerPool(baseConfig);
    expect(Object.isFrozen(pool.vmConfig)).toBe(true);
  });

  it("defaults firecrackerBin to 'firecracker'", () => {
    const pool = new FirecrackerPool(baseConfig);
    expect(pool.firecrackerBin).toBe("firecracker");
  });

  it("accepts custom firecrackerBin", () => {
    const pool = new FirecrackerPool({
      ...baseConfig,
      firecrackerBin: "/usr/local/bin/firecracker"
    });
    expect(pool.firecrackerBin).toBe("/usr/local/bin/firecracker");
  });

  it("defaults poolSize to 2", () => {
    const pool = new FirecrackerPool(baseConfig);
    expect(pool.poolSize).toBe(2);
  });

  it("accepts custom poolSize", () => {
    const pool = new FirecrackerPool({ ...baseConfig, poolSize: 5 });
    expect(pool.poolSize).toBe(5);
  });

  it("defaults maxVms to 10", () => {
    const pool = new FirecrackerPool(baseConfig);
    expect(pool.maxVms).toBe(10);
  });

  it("accepts custom maxVms", () => {
    const pool = new FirecrackerPool({ ...baseConfig, maxVms: 20 });
    expect(pool.maxVms).toBe(20);
  });
});

describe("FirecrackerPool counters", () => {
  it("starts with zero ready count", () => {
    const pool = new FirecrackerPool(baseConfig);
    expect(pool.readyCount).toBe(0);
  });

  it("starts with zero in-use count", () => {
    const pool = new FirecrackerPool(baseConfig);
    expect(pool.inUseCount).toBe(0);
  });

  it("starts with zero total count", () => {
    const pool = new FirecrackerPool(baseConfig);
    expect(pool.totalCount).toBe(0);
  });
});

describe("FirecrackerPool.drain", () => {
  it("can be called on an empty pool", async () => {
    const pool = new FirecrackerPool(baseConfig);
    await expect(pool.drain()).resolves.toBeUndefined();
  });

  it("prevents warmup after drain", async () => {
    const pool = new FirecrackerPool(baseConfig);
    await pool.drain();
    await expect(pool.warmup()).rejects.toThrow("Pool is draining");
  });

  it("prevents acquire after drain", async () => {
    const pool = new FirecrackerPool(baseConfig);
    await pool.drain();
    await expect(pool.acquire()).rejects.toThrow("Pool is draining");
  });
});

describe("FirecrackerPool.warmup error handling", () => {
  it(
    "throws when all boot attempts fail",
    async () => {
      const pool = new FirecrackerPool({
        vmConfig: {
          kernelImagePath: "/nonexistent/vmlinux",
          rootfsPath: "/nonexistent/rootfs.ext4"
        },
        firecrackerBin: "/nonexistent/firecracker"
      });
      await expect(pool.warmup()).rejects.toThrow(
        /All .* VM boot attempts failed/
      );
    },
    30_000
  );
});

describe("FirecrackerPool.acquire error handling", () => {
  it("fails when at capacity with no ready VMs", async () => {
    // maxVms=0 means immediate capacity failure
    const pool = new FirecrackerPool({
      ...baseConfig,
      maxVms: 0
    });
    await expect(pool.acquire()).rejects.toThrow("Pool at capacity");
  });
});
