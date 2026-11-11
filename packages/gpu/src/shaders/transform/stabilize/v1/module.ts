import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

const Params = d.struct({a: d.f32, b: d.f32, x: d.f32, c: d.f32, e: d.f32, y: d.f32});
const layout = tgpu.bindGroupLayout({source: {texture: "float"}, outputTexture: {storageTexture: "rgba8unorm"}, params: {uniform: Params}});
export const transformStabilizeV1 = defineModule({
  precision: { "source": "working", "output": "working" },
  id: "transform.stabilize", version: 1, surface: "internal", category: "transform",
  linearity: "nonlinear-in-rgb", kind: "compute", params: Params,
  paramDefaults: {a: 1, b: 0, x: 0, c: 0, e: 1, y: 0}, layout, workgroupSize: [16, 16, 1],
  wgsl: /* wgsl */ `
fn cubic(distance: f32) -> f32 {
  let x=abs(distance);
  if (x<=1.0) { return 1.5*x*x*x-2.5*x*x+1.0; }
  if (x<2.0) { return -0.5*x*x*x+2.5*x*x-4.0*x+2.0; }
  return 0.0;
}
@compute @workgroup_size(16,16,1)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims=textureDimensions(layout.$.source);
  if (gid.x>=dims.x || gid.y>=dims.y) { return; }
  let p=layout.$.params; let uv=(vec2f(gid.xy)+0.5)/vec2f(dims);
  let at=vec2f(p.a*uv.x+p.b*uv.y+p.x,p.c*uv.x+p.e*uv.y+p.y)*vec2f(dims)-0.5;
  let base=vec2i(floor(at)); var result=vec4f(0);
  for (var y=-1;y<=2;y++) { for (var x=-1;x<=2;x++) {
    let offset=vec2i(x,y); let weight=cubic(at.x-f32(base.x+x))*cubic(at.y-f32(base.y+y));
    result+=textureLoad(layout.$.source,clamp(base+offset,vec2i(0),vec2i(dims)-1),0)*weight;
  } }
  let alpha=clamp(result.a,0.0,1.0);
  textureStore(layout.$.outputTexture,vec2i(gid.xy),vec4f(clamp(result.rgb,vec3f(0),vec3f(alpha)),alpha));
}`,
  io: {inputs: {source: {colorSpace: "encoded-sdr", alpha: "premultiplied", bindingKinds: ["texture_2d"]}},
    output: {colorSpace: "encoded-sdr", alpha: "premultiplied", format: "rgba8unorm", dimensions: "same-as:source"}, rod: "same-as:source"}
});
