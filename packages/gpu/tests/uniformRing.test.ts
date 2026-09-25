import { describe, it, expect } from "vitest";
import { makeUniformRing } from "../src/context.js";

/**
 * The uniform ring is what bounds GPU buffer allocation when a host dispatches
 * effects every frame. These tests run against a fake device (no GPU needed)
 * and lock the two invariants the Executor relies on: distinct buffers within
 * one submission, and reuse when the next submission begins.
 */
// The ring references the WebGPU usage flags; the node/Dawn globals are only
// installed once a real device exists, so stub them for this device-free test.
(globalThis as unknown as { GPUBufferUsage?: unknown }).GPUBufferUsage ??= {
  UNIFORM: 0x40,
  COPY_DST: 0x8
};

interface FakeBuffer {
  size: number;
  destroyed: boolean;
  destroy(): void;
}

function makeFakeDevice() {
  let created = 0;
  const createBuffer = ({ size }: { size: number }): FakeBuffer => {
    created++;
    const buffer: FakeBuffer = {
      size,
      destroyed: false,
      destroy() {
        this.destroyed = true;
      }
    };
    return buffer;
  };
  return {
    device: { createBuffer } as unknown as GPUDevice,
    getCreated: () => created
  };
}

const RING_SIZE = 64;

describe("uniform ring", () => {
  it("hands out distinct buffers across one ring window", () => {
    const { device } = makeFakeDevice();
    const ring = makeUniformRing(device);
    const seen = new Set<unknown>();
    for (let i = 0; i < RING_SIZE; i++) {
      seen.add(ring.acquire(16));
    }
    expect(seen.size).toBe(RING_SIZE);
  });

  it("keeps every buffer distinct within a dense submission", () => {
    const { device, getCreated } = makeFakeDevice();
    const ring = makeUniformRing(device);
    const seen = new Set<GPUBuffer>();
    for (let i = 0; i < RING_SIZE * 3; i++) {
      const buffer = ring.acquire(i === RING_SIZE ? 64 : 16);
      expect(seen.has(buffer)).toBe(false);
      seen.add(buffer);
    }
    expect(getCreated()).toBe(RING_SIZE * 3);
  });

  it("reuses buffers after a submission boundary", () => {
    const { device } = makeFakeDevice();
    const ring = makeUniformRing(device);
    const first = ring.acquire(16);
    ring.beginSubmission();
    expect(ring.acquire(16)).toBe(first);
  });

  it("recreates a slot's buffer when a larger size is requested", () => {
    const { device, getCreated } = makeFakeDevice();
    const ring = makeUniformRing(device);
    const small = ring.acquire(16) as unknown as FakeBuffer;
    ring.beginSubmission();
    const big = ring.acquire(64) as unknown as FakeBuffer;
    expect(big).not.toBe(small);
    expect(small.destroyed).toBe(true);
    expect(big.size).toBe(64);
    expect(getCreated()).toBe(2);
  });

  it("destroys all buffers on dispose", () => {
    const { device } = makeFakeDevice();
    const ring = makeUniformRing(device);
    const buffers: FakeBuffer[] = [];
    for (let i = 0; i < 5; i++) {
      buffers.push(ring.acquire(16) as unknown as FakeBuffer);
    }
    ring.dispose();
    for (const buffer of buffers) {
      expect(buffer.destroyed).toBe(true);
    }
  });
});
