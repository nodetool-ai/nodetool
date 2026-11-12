// Device acquisition for the native guest. Shader and compositor bodies remain
// the package implementations, compiled into the guest by esbuild.
import { createGPUContextFromDevice } from '../../../../packages/gpu/src/context.ts';
import { compositeLayersHeadless } from '../../../../packages/gpu/src/compositor/headless.ts';

export async function createNodeGPUDevice() {
  const adapter = await globalThis.navigator?.gpu?.requestAdapter();
  if (!adapter) throw new Error('Native WebGPU adapter unavailable');
  return adapter.requestDevice();
}

export const getNodeGPUDevice = createNodeGPUDevice;

export async function createNodeGPUContext() {
  return createGPUContextFromDevice(await createNodeGPUDevice());
}

export async function compositeImageLayers(layers, width, height) {
  const device = await createNodeGPUDevice();
  try {
    return await compositeLayersHeadless(device, layers, width, height);
  } finally {
    device.destroy();
  }
}

export { compositeLayersHeadless };
