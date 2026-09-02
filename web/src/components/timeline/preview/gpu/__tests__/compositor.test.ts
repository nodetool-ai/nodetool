import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest
} from "@jest/globals";
import { stub } from "../../../../../test-utils/doubles";

const blit = jest.fn();
const composite = jest.fn(() => ({ texture: {}, drawn: 1 }));

jest.mock("@nodetool-ai/timeline/render", () => ({
  GpuFrameCompositor: jest.fn().mockImplementation(() => ({
    composite,
    blit,
    resize: jest.fn(),
    setReferenceSize: jest.fn(),
    dispose: jest.fn()
  }))
}));

import { WebGPUCompositor } from "../compositor";

interface FakeGpu {
  device: GPUDevice;
  context: GPUCanvasContext;
  canvas: HTMLCanvasElement;
  configure: jest.Mock<(configuration: GPUCanvasConfiguration) => undefined>;
}

/**
 * A WebGPU surface that records `configure` calls and hands out devices in
 * order, so a test can tell which device claimed the canvas and when.
 */
function fakeGpu(): FakeGpu {
  const configure =
    jest.fn<(configuration: GPUCanvasConfiguration) => undefined>();
  const device = stub<GPUDevice>({
    createCommandEncoder: () =>
      stub<GPUCommandEncoder>({ finish: () => stub<GPUCommandBuffer>({}) }),
    queue: stub<GPUQueue>({ submit() {} }),
    destroy() {}
  });
  const context = stub<GPUCanvasContext>({
    configure,
    getCurrentTexture: () =>
      stub<GPUTexture>({ createView: () => stub<GPUTextureView>({}) })
  });
  // SAFETY: `getContext` is overloaded over every context id; this canvas
  // answers "webgpu" only, which is all the compositor asks for.
  const getContext = ((type: string) =>
    type === "webgpu" ? context : null) as HTMLCanvasElement["getContext"];
  const canvas = stub<HTMLCanvasElement>({ width: 320, height: 180, getContext });
  Object.defineProperty(navigator, "gpu", {
    configurable: true,
    value: {
      requestAdapter: async () => ({ requestDevice: async () => device }),
      getPreferredCanvasFormat: () => "bgra8unorm"
    }
  });
  return { device, context, canvas, configure };
}

describe("WebGPUCompositor", () => {
  const originalGpu = (navigator as { gpu?: unknown }).gpu;

  beforeEach(() => {
    blit.mockClear();
    composite.mockClear();
  });

  afterEach(() => {
    Object.defineProperty(navigator, "gpu", {
      value: originalGpu,
      configurable: true
    });
  });

  it("claims the canvas on the first present, not in init", async () => {
    // React StrictMode mounts the preview twice, so two instances race
    // `init` on one canvas. The one that never renders must never configure
    // the context, or the survivor blits into a texture of a destroyed device.
    const gpu = fakeGpu();
    const loser = new WebGPUCompositor();
    const survivor = new WebGPUCompositor();
    await loser.init(gpu.canvas);
    await survivor.init(gpu.canvas);
    expect(gpu.configure).not.toHaveBeenCalled();

    loser.dispose();
    survivor.setLayers([]);
    survivor.render();
    expect(gpu.configure).toHaveBeenCalledTimes(1);
    expect(blit).toHaveBeenCalledTimes(1);

    survivor.render();
    expect(gpu.configure).toHaveBeenCalledTimes(1);
    survivor.dispose();
  });

  it("configures the canvas in the format the shared core blits into", async () => {
    // The core's blit pipeline targets rgba8unorm. A canvas configured with
    // the browser's preferred format (bgra8unorm on macOS and Windows) fails
    // render-pass validation on every present and the preview stays black.
    const gpu = fakeGpu();
    const compositor = new WebGPUCompositor();
    await compositor.init(gpu.canvas);
    compositor.setLayers([]);
    compositor.render();
    expect(gpu.configure).toHaveBeenCalledWith(
      expect.objectContaining({ device: gpu.device, format: "rgba8unorm" })
    );
    compositor.dispose();
  });

  it("reconfigures after a resize", async () => {
    const gpu = fakeGpu();
    const compositor = new WebGPUCompositor();
    await compositor.init(gpu.canvas);
    compositor.setLayers([]);
    compositor.render();
    compositor.resize(640, 360);
    compositor.render();
    expect(gpu.configure).toHaveBeenCalledTimes(2);
    compositor.dispose();
  });
});
