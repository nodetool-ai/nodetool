import { expect, it } from "vitest";
import vectors from "./fixtures/inverse-levels.json" with { type: "json" };
import { getNodeGPUDevice } from "../src/node.js";
import { SRGB_TRANSFER_WGSL, PREMULTIPLY_RGB_WGSL, UNPREMULTIPLY_RGB_WGSL, ZERO_ALPHA_WGSL, EXPOSURE_UNPREMULTIPLY_WGSL } from "../src/colorHelpers.js";

it("evaluates shared native vectors at zero/low alpha and both transfer breakpoints", async () => {
  const device = await getNodeGPUDevice();
  const expressions: string[] = [];
  const expected: number[] = [];
  for (const v of vectors.alphaVectors) {
    expressions.push(`{ let c = vec4f(${v.rgb}, 0, 0, ${v.alpha}); result[${expected.length}] = (${PREMULTIPLY_RGB_WGSL}).r; }`);
    expected.push(v.premultiplied);
    expressions.push(`{ let c = vec4f(${v.premultiplied}, 0, 0, ${v.alpha}); var value = 0.0; if (!(${ZERO_ALPHA_WGSL})) { value = (${UNPREMULTIPLY_RGB_WGSL}).r; } result[${expected.length}] = value; }`);
    expected.push(v.unpremultiplied);
    expressions.push(`{ let src = vec4f(${v.premultiplied}, 0, 0, ${v.alpha}); result[${expected.length}] = (${EXPOSURE_UNPREMULTIPLY_WGSL}).r; }`);
    expected.push(v.exposureStraight);
  }
  for (const v of vectors.transferVectors) {
    expressions.push(`result[${expected.length}] = decode(vec3f(${v.encoded})).r;`);
    expected.push(v.linear);
  }
  for (const v of vectors.encodeVectors) {
    expressions.push(`result[${expected.length}] = encode(vec3f(${v.linear})).r;`);
    expected.push(v.encoded);
  }
  const size = expected.length * 4;
  const storage = device.createBuffer({ size, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const readback = device.createBuffer({ size, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  device.pushErrorScope("validation");
  try {
    const shader = device.createShaderModule({ code: `${SRGB_TRANSFER_WGSL}
@group(0) @binding(0) var<storage, read_write> result: array<f32>;
@compute @workgroup_size(1) fn main() { ${expressions.join("\n")} }` });
    const pipeline = device.createComputePipeline({ layout: "auto", compute: { module: shader, entryPoint: "main" } });
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: storage } }] }));
    pass.dispatchWorkgroups(1);
    pass.end();
    encoder.copyBufferToBuffer(storage, 0, readback, 0, size);
    device.queue.submit([encoder.finish()]);
    await readback.mapAsync(GPUMapMode.READ);
    const actual = new Float32Array(readback.getMappedRange());
    expected.forEach((value, i) => expect(actual[i]).toBeCloseTo(value, 6));
    readback.unmap();
  } finally {
    storage.destroy();
    readback.destroy();
    expect(await device.popErrorScope()).toBeNull();
  }
});
