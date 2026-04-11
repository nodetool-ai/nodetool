/**
 * Tests for FirecrackerVM.
 *
 * These are unit tests that verify constructor behavior, state transitions,
 * and error conditions. Integration tests that actually boot a VM require
 * a Linux host with /dev/kvm and the firecracker binary.
 */
import { describe, it, expect } from "vitest";
import { FirecrackerVM } from "../src/firecracker-vm.js";

describe("FirecrackerVM constructor", () => {
  const baseConfig = {
    kernelImagePath: "/opt/vmlinux",
    rootfsPath: "/opt/rootfs.ext4"
  };

  it("stores kernel image path", () => {
    const vm = new FirecrackerVM(baseConfig);
    expect(vm.config.kernelImagePath).toBe("/opt/vmlinux");
  });

  it("stores rootfs path", () => {
    const vm = new FirecrackerVM(baseConfig);
    expect(vm.config.rootfsPath).toBe("/opt/rootfs.ext4");
  });

  it("defaults firecrackerBin to 'firecracker'", () => {
    const vm = new FirecrackerVM(baseConfig);
    expect(vm.firecrackerBin).toBe("firecracker");
  });

  it("accepts custom firecrackerBin", () => {
    const vm = new FirecrackerVM(baseConfig, "/usr/local/bin/firecracker");
    expect(vm.firecrackerBin).toBe("/usr/local/bin/firecracker");
  });

  it("assigns a CID >= 3", () => {
    const vm = new FirecrackerVM(baseConfig);
    expect(vm.cid).toBeGreaterThanOrEqual(3);
  });

  it("assigns unique CIDs to different VMs", () => {
    const vm1 = new FirecrackerVM(baseConfig);
    const vm2 = new FirecrackerVM(baseConfig);
    const vm3 = new FirecrackerVM(baseConfig);
    const cids = new Set([vm1.cid, vm2.cid, vm3.cid]);
    expect(cids.size).toBe(3);
  });

  it("freezes the config object", () => {
    const vm = new FirecrackerVM({
      ...baseConfig,
      vcpuCount: 2,
      memSizeMib: 256
    });
    expect(vm.config.vcpuCount).toBe(2);
    expect(vm.config.memSizeMib).toBe(256);
    expect(Object.isFrozen(vm.config)).toBe(true);
  });
});

describe("FirecrackerVM state", () => {
  const baseConfig = {
    kernelImagePath: "/opt/vmlinux",
    rootfsPath: "/opt/rootfs.ext4"
  };

  it("isBooted is false before boot", () => {
    const vm = new FirecrackerVM(baseConfig);
    expect(vm.isBooted).toBe(false);
  });

  it("isDestroyed is false initially", () => {
    const vm = new FirecrackerVM(baseConfig);
    expect(vm.isDestroyed).toBe(false);
  });

  it("isRunning is false before boot", () => {
    const vm = new FirecrackerVM(baseConfig);
    expect(vm.isRunning).toBe(false);
  });

  it("throws when accessing apiSocketPath before boot", () => {
    const vm = new FirecrackerVM(baseConfig);
    expect(() => vm.apiSocketPath).toThrow("VM has not been booted");
  });

  it("throws when accessing vsockUdsPath before boot", () => {
    const vm = new FirecrackerVM(baseConfig);
    expect(() => vm.vsockUdsPath).toThrow("VM has not been booted");
  });
});

describe("FirecrackerVM.destroy", () => {
  const baseConfig = {
    kernelImagePath: "/opt/vmlinux",
    rootfsPath: "/opt/rootfs.ext4"
  };

  it("sets isDestroyed to true", async () => {
    const vm = new FirecrackerVM(baseConfig);
    await vm.destroy();
    expect(vm.isDestroyed).toBe(true);
  });

  it("is safe to call multiple times", async () => {
    const vm = new FirecrackerVM(baseConfig);
    await vm.destroy();
    await vm.destroy();
    expect(vm.isDestroyed).toBe(true);
  });

  it("prevents boot after destroy", async () => {
    const vm = new FirecrackerVM(baseConfig);
    await vm.destroy();
    await expect(vm.boot()).rejects.toThrow("VM has been destroyed");
  });
});

describe("FirecrackerVM.boot error handling", () => {
  it(
    "fails when firecracker binary is not found",
    async () => {
      const vm = new FirecrackerVM(
        {
          kernelImagePath: "/opt/vmlinux",
          rootfsPath: "/opt/rootfs.ext4"
        },
        "/nonexistent/firecracker"
      );
      await expect(vm.boot()).rejects.toThrow(
        "Firecracker process failed to start"
      );
      // Should be cleaned up after failed boot
      expect(vm.isDestroyed).toBe(true);
    },
    15_000
  );

  it("prevents double boot", async () => {
    const vm = new FirecrackerVM({
      kernelImagePath: "/opt/vmlinux",
      rootfsPath: "/opt/rootfs.ext4"
    });
    await vm.destroy();
    await expect(vm.boot()).rejects.toThrow("VM has been destroyed");
  });
});

describe("FirecrackerVM.connectVsock", () => {
  it("throws when VM is not booted", async () => {
    const vm = new FirecrackerVM({
      kernelImagePath: "/opt/vmlinux",
      rootfsPath: "/opt/rootfs.ext4"
    });
    await expect(vm.connectVsock(1024)).rejects.toThrow(
      "VM is not in a connectable state"
    );
  });

  it("throws when VM is destroyed", async () => {
    const vm = new FirecrackerVM({
      kernelImagePath: "/opt/vmlinux",
      rootfsPath: "/opt/rootfs.ext4"
    });
    await vm.destroy();
    await expect(vm.connectVsock(1024)).rejects.toThrow(
      "VM is not in a connectable state"
    );
  });
});
