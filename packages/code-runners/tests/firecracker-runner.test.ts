/**
 * Tests for FirecrackerRunner.
 *
 * Verifies constructor defaults, option handling, rootfs resolution,
 * and language inference. Integration tests that actually execute code
 * require a Linux host with /dev/kvm, the firecracker binary, a kernel,
 * and rootfs images.
 */
import { describe, it, expect } from "vitest";
import { FirecrackerRunner } from "../src/firecracker-runner.js";

const defaultOptions = {
  kernelImagePath: "/opt/vmlinux",
  rootfsImages: {
    python: "/opt/rootfs-python.ext4",
    javascript: "/opt/rootfs-node.ext4",
    bash: "/opt/rootfs-alpine.ext4"
  }
};

describe("FirecrackerRunner constructor", () => {
  it("stores kernelImagePath", () => {
    const runner = new FirecrackerRunner(defaultOptions);
    expect(runner.kernelImagePath).toBe("/opt/vmlinux");
  });

  it("stores rootfsImages", () => {
    const runner = new FirecrackerRunner(defaultOptions);
    expect(runner.rootfsImages).toEqual({
      python: "/opt/rootfs-python.ext4",
      javascript: "/opt/rootfs-node.ext4",
      bash: "/opt/rootfs-alpine.ext4"
    });
  });

  it("freezes rootfsImages", () => {
    const runner = new FirecrackerRunner(defaultOptions);
    expect(Object.isFrozen(runner.rootfsImages)).toBe(true);
  });

  it("defaults firecrackerBin to 'firecracker'", () => {
    const runner = new FirecrackerRunner(defaultOptions);
    expect(runner.firecrackerBin).toBe("firecracker");
  });

  it("accepts custom firecrackerBin", () => {
    const runner = new FirecrackerRunner({
      ...defaultOptions,
      firecrackerBin: "/usr/local/bin/firecracker"
    });
    expect(runner.firecrackerBin).toBe("/usr/local/bin/firecracker");
  });

  it("defaults vcpuCount to 1", () => {
    const runner = new FirecrackerRunner(defaultOptions);
    expect(runner.vcpuCount).toBe(1);
  });

  it("accepts custom vcpuCount", () => {
    const runner = new FirecrackerRunner({ ...defaultOptions, vcpuCount: 4 });
    expect(runner.vcpuCount).toBe(4);
  });

  it("defaults memSizeMib to 128", () => {
    const runner = new FirecrackerRunner(defaultOptions);
    expect(runner.memSizeMib).toBe(128);
  });

  it("accepts custom memSizeMib", () => {
    const runner = new FirecrackerRunner({
      ...defaultOptions,
      memSizeMib: 512
    });
    expect(runner.memSizeMib).toBe(512);
  });

  it("defaults timeoutSeconds to 10", () => {
    const runner = new FirecrackerRunner(defaultOptions);
    expect(runner.timeoutSeconds).toBe(10);
  });

  it("accepts custom timeoutSeconds", () => {
    const runner = new FirecrackerRunner({
      ...defaultOptions,
      timeoutSeconds: 30
    });
    expect(runner.timeoutSeconds).toBe(30);
  });

  it("defaults guestAgentPort to 1024", () => {
    const runner = new FirecrackerRunner(defaultOptions);
    expect(runner.guestAgentPort).toBe(1024);
  });

  it("accepts custom guestAgentPort", () => {
    const runner = new FirecrackerRunner({
      ...defaultOptions,
      guestAgentPort: 2048
    });
    expect(runner.guestAgentPort).toBe(2048);
  });

  it("defaults networkInterface to null", () => {
    const runner = new FirecrackerRunner(defaultOptions);
    expect(runner.networkInterface).toBeNull();
  });

  it("accepts networkInterface config", () => {
    const runner = new FirecrackerRunner({
      ...defaultOptions,
      networkInterface: {
        hostDevName: "tap0",
        guestMac: "AA:BB:CC:DD:EE:FF"
      }
    });
    expect(runner.networkInterface).toEqual({
      hostDevName: "tap0",
      guestMac: "AA:BB:CC:DD:EE:FF"
    });
  });

  it("defaults defaultRootfs to null", () => {
    const runner = new FirecrackerRunner(defaultOptions);
    expect(runner.defaultRootfs).toBeNull();
  });

  it("accepts defaultRootfs", () => {
    const runner = new FirecrackerRunner({
      ...defaultOptions,
      defaultRootfs: "/opt/rootfs-default.ext4"
    });
    expect(runner.defaultRootfs).toBe("/opt/rootfs-default.ext4");
  });

  it("stores bootArgs when provided", () => {
    const runner = new FirecrackerRunner({
      ...defaultOptions,
      bootArgs: "console=ttyS0 quiet"
    });
    expect(runner.bootArgs).toBe("console=ttyS0 quiet");
  });

  it("defaults bootArgs to undefined", () => {
    const runner = new FirecrackerRunner(defaultOptions);
    expect(runner.bootArgs).toBeUndefined();
  });
});

describe("FirecrackerRunner rootfs resolution", () => {
  it("resolves known language to its rootfs", () => {
    const runner = new FirecrackerRunner(defaultOptions);
    // Access private method via casting for testing
    const resolve = (runner as unknown as { _resolveRootfs: (lang: string) => string })._resolveRootfs.bind(runner);
    expect(resolve("python")).toBe("/opt/rootfs-python.ext4");
    expect(resolve("javascript")).toBe("/opt/rootfs-node.ext4");
    expect(resolve("bash")).toBe("/opt/rootfs-alpine.ext4");
  });

  it("falls back to defaultRootfs for unknown language", () => {
    const runner = new FirecrackerRunner({
      ...defaultOptions,
      defaultRootfs: "/opt/rootfs-default.ext4"
    });
    const resolve = (runner as unknown as { _resolveRootfs: (lang: string) => string })._resolveRootfs.bind(runner);
    expect(resolve("rust")).toBe("/opt/rootfs-default.ext4");
  });

  it("throws when language has no rootfs and no default", () => {
    const runner = new FirecrackerRunner(defaultOptions);
    const resolve = (runner as unknown as { _resolveRootfs: (lang: string) => string })._resolveRootfs.bind(runner);
    expect(() => resolve("rust")).toThrow(
      'No rootfs image configured for language "rust"'
    );
  });
});

describe("FirecrackerRunner language inference", () => {
  it("infers first rootfsImages key", () => {
    const runner = new FirecrackerRunner(defaultOptions);
    const infer = (runner as unknown as { _inferLanguage: () => string })._inferLanguage.bind(runner);
    expect(infer()).toBe("python");
  });

  it("falls back to bash when rootfsImages is empty", () => {
    const runner = new FirecrackerRunner({
      kernelImagePath: "/opt/vmlinux",
      rootfsImages: {},
      defaultRootfs: "/opt/rootfs.ext4"
    });
    const infer = (runner as unknown as { _inferLanguage: () => string })._inferLanguage.bind(runner);
    expect(infer()).toBe("bash");
  });
});

describe("FirecrackerRunner.stop", () => {
  it("is safe to call before any execution", () => {
    const runner = new FirecrackerRunner(defaultOptions);
    expect(() => runner.stop()).not.toThrow();
  });

  it("is safe to call multiple times", () => {
    const runner = new FirecrackerRunner(defaultOptions);
    runner.stop();
    runner.stop();
    runner.stop();
  });
});

describe("FirecrackerRunner.setPool", () => {
  it("accepts a pool instance", () => {
    const runner = new FirecrackerRunner(defaultOptions);
    // We can't easily create a real pool in unit tests, but we can verify
    // that setPool doesn't throw with a mock
    const mockPool = {
      acquire: async () => ({} as never),
      release: () => {}
    };
    expect(() => runner.setPool(mockPool as never)).not.toThrow();
  });
});
