/** Device loss is terminal for resources owned by that device. Hosts choose recovery. */
const lostDevices = new WeakSet<GPUDevice>();
const observedDevices = new WeakSet<GPUDevice>();

export function observeDeviceLoss(device: GPUDevice): void {
  if (observedDevices.has(device)) {
    return;
  }
  observedDevices.add(device);
  void device.lost.then(() => lostDevices.add(device));
}

/** Validate the 2D, single-sample resources used by our render hosts. */
export function validateRenderTexture(
  device: GPUDevice,
  width: number,
  height: number,
  format: GPUTextureFormat,
  usage: GPUTextureUsageFlags
): void {
  observeDeviceLoss(device);
  if (lostDevices.has(device)) {
    throw new Error("WebGPU device lost. Recreate renderer resources before rendering.");
  }
  const limit = device.limits.maxTextureDimension2D;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > limit || height > limit) {
    throw new Error(`Invalid ${width}x${height} render texture. Device limit is ${limit}.`);
  }
  if (usage === 0) {
    throw new Error("Render texture requires a usage");
  }
  // RGBA8 and FP16 support filtering and storage writes. BGRA and sRGB
  // presentation formats have the storage restrictions below. shader-f16
  // enables arithmetic, not rgba16float textures.
  if (format !== "rgba8unorm" && format !== "rgba16float" && format !== "bgra8unorm" && format !== "rgba8unorm-srgb" && format !== "bgra8unorm-srgb") {
    throw new Error(`Unqualified render texture format: ${format}`);
  }
  if (usage & GPUTextureUsage.STORAGE_BINDING) {
    if (format.endsWith("-srgb") || (format === "bgra8unorm" && !device.features.has("bgra8unorm-storage"))) {
      throw new Error(`Storage binding unavailable for ${format}`);
    }
  }
}

/** Probe the actual descriptor. Error scopes catch asynchronous WebGPU failures. */
export async function checkRenderTexture(
  device: GPUDevice,
  width: number,
  height: number,
  format: GPUTextureFormat,
  usage: GPUTextureUsageFlags
): Promise<void> {
  validateRenderTexture(device, width, height, format, usage);
  device.pushErrorScope("validation");
  device.pushErrorScope("out-of-memory");
  let texture: GPUTexture | undefined;
  let allocationError: GPUError | null;
  let validationError: GPUError | null;
  try {
    texture = device.createTexture({ size: { width, height }, format, usage });
    await device.queue.onSubmittedWorkDone();
  } finally {
    texture?.destroy();
    allocationError = await device.popErrorScope();
    validationError = await device.popErrorScope();
  }
  if (allocationError || validationError) {
    throw new Error(`WebGPU render allocation failed: ${(allocationError ?? validationError)?.message}`);
  }
  // The loss promise can settle while waiting for the queue.
  validateRenderTexture(device, width, height, format, usage);
}
