/**
 * Copies a video's current frame into a texture without leaving the GPU.
 *
 * `copyExternalImageToTexture` from a `<video>` or a `VideoFrame` reads the
 * frame back to the CPU in shipping Safari: WebKit converts the decoded
 * pixel buffer to a `CGImage`, copies its bytes, swizzles them and sends them
 * back to the GPU process with `writeTexture` (`getImageBytesFromVideoFrame`
 * in `Source/WebCore/Modules/WebGPU/GPUQueue.cpp`, safari-7622 to
 * safari-7625 branches). That is several full-frame CPU copies per video
 * layer per frame, which is what holds playback far below real time on an
 * iPhone. `importExternalTexture` wraps the decoder's own planes instead, so
 * one render pass from the external texture into the layer's texture does the
 * same copy on the GPU.
 */

type VideoSource = HTMLVideoElement | VideoFrame;

const SHADER = /* wgsl */ `
@group(0) @binding(0) var source: texture_external;
@group(0) @binding(1) var sourceSampler: sampler;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs(@builtin(vertex_index) index: u32) -> VertexOut {
  let corner = vec2f(f32((index << 1u) & 2u), f32(index & 2u));
  var out: VertexOut;
  out.position = vec4f(corner * 2.0 - 1.0, 0.0, 1.0);
  out.uv = vec2f(corner.x, 1.0 - corner.y);
  return out;
}

@fragment
fn fs(in: VertexOut) -> @location(0) vec4f {
  return textureSampleBaseClampToEdge(source, sourceSampler, in.uv);
}
`;

/**
 * Whether a video's frames carry a rotation. WebKit's external textures
 * expose the coded picture without applying the track's rotation, so a
 * rotated video keeps the slower copy, which does apply it. Checked once per
 * element and source URL. Undefined when the frame cannot be inspected yet.
 */
const videoRotation = new WeakMap<HTMLVideoElement, { src: string; rotated: boolean }>();

function frameIsRotated(frame: VideoFrame): boolean {
  const rotation = (frame as VideoFrame & { rotation?: number }).rotation;
  if (typeof rotation === "number") return rotation % 360 !== 0;
  // Without the attribute, a quarter turn still shows as swapped axes.
  return frame.codedWidth > frame.codedHeight !== frame.displayWidth > frame.displayHeight;
}

function isRotatedVideo(video: HTMLVideoElement): boolean | undefined {
  const src = video.currentSrc || video.src;
  const known = videoRotation.get(video);
  if (known && known.src === src) return known.rotated;
  if (typeof VideoFrame === "undefined") return undefined;
  let frame: VideoFrame | undefined;
  try {
    frame = new VideoFrame(video);
    const rotated =
      frameIsRotated(frame) ||
      frame.codedWidth > frame.codedHeight !== video.videoWidth > video.videoHeight;
    videoRotation.set(video, { src, rotated });
    return rotated;
  } catch {
    return undefined;
  } finally {
    frame?.close();
  }
}

/** Whether a source can take the external-texture copy. */
export function canCopyVideoOnGpu(source: VideoSource): boolean {
  if (source instanceof HTMLVideoElement) return isRotatedVideo(source) === false;
  return !frameIsRotated(source);
}

export class ExternalVideoCopier {
  private pipeline: GPURenderPipeline | null = null;
  private sampler: GPUSampler | null = null;

  constructor(private readonly device: GPUDevice) {}

  /** Whether this device can import external textures at all. */
  static supported(device: GPUDevice): boolean {
    return typeof device.importExternalTexture === "function";
  }

  /**
   * Draw the source's current frame over all of `target`. The pass is
   * submitted before returning: an external texture from a `<video>` expires
   * when the current task ends, and one from a `VideoFrame` when the frame is
   * closed, so the work cannot wait for the compositor's own submit. Queue
   * order still puts it ahead of the composite that samples `target`.
   */
  copy(source: VideoSource, target: GPUTexture): void {
    const device = this.device;
    const external = device.importExternalTexture({ source });
    const pipeline = this.ensurePipeline();
    const bindGroup = device.createBindGroup({
      label: "preview-external-video",
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: external },
        { binding: 1, resource: this.ensureSampler() }
      ]
    });
    const encoder = device.createCommandEncoder({ label: "preview-external-video" });
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: target.createView(),
          loadOp: "clear",
          storeOp: "store",
          clearValue: { r: 0, g: 0, b: 0, a: 1 }
        }
      ]
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  private ensurePipeline(): GPURenderPipeline {
    if (this.pipeline) return this.pipeline;
    const module = this.device.createShaderModule({
      label: "preview-external-video",
      code: SHADER
    });
    this.pipeline = this.device.createRenderPipeline({
      label: "preview-external-video",
      layout: "auto",
      vertex: { module, entryPoint: "vs" },
      fragment: { module, entryPoint: "fs", targets: [{ format: "rgba8unorm" }] },
      primitive: { topology: "triangle-list" }
    });
    return this.pipeline;
  }

  private ensureSampler(): GPUSampler {
    this.sampler ??= this.device.createSampler({
      label: "preview-external-video",
      magFilter: "linear",
      minFilter: "linear"
    });
    return this.sampler;
  }
}
