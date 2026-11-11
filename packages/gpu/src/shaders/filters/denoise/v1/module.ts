import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

const Spatial = d.struct({
  lumaStrength: d.f32,
  chromaStrength: d.f32,
  radius: d.u32
});
const spatialLayout = tgpu.bindGroupLayout({
  source: { texture: "float" },
  outputTexture: { storageTexture: "rgba8unorm" },
  params: { uniform: Spatial }
});
const colorCode = /* wgsl */ `
fn ycc(c:vec4f)->vec4f { let y=dot(c.rgb,vec3f(0.2126,0.7152,0.0722)); return vec4f(y,(c.b-y)/1.8556,(c.r-y)/1.5748,c.a); }
fn rgb(c:vec3f)->vec3f { let r=c.x+1.5748*c.z; let b=c.x+1.8556*c.y; return vec3f(r,(c.x-0.2126*r-0.0722*b)/0.7152,b); }
fn current(at:vec2i)->vec4f {
  let size=vec2i(textureDimensions(layout.$.source)); let c=textureLoad(layout.$.source,clamp(at,vec2i(0),size-1),0);
  return vec4f(c.rgb/max(c.a,1.0/255.0),c.a);
}
`;
export const filtersDenoiseSpatialV1 = defineModule({
  precision: { "source": "working", "output": "working" },
  id: "filters.denoise.spatial",
  version: 1,
  surface: "internal",
  category: "filters",
  linearity: "nonlinear-in-rgb",
  kind: "compute",
  params: Spatial,
  paramDefaults: { lumaStrength: 0, chromaStrength: 0, radius: 2 },
  layout: spatialLayout,
  workgroupSize: [16, 16, 1],
  wgsl:
    colorCode +
    /* wgsl */ `
@compute @workgroup_size(16,16,1)
fn main(@builtin(global_invocation_id) gid:vec3u) {
  let dims=textureDimensions(layout.$.source); if (any(gid.xy>=dims)) { return; }
  let at=vec2i(gid.xy); let p=layout.$.params; let center=ycc(current(at));
  if (center.a==0.0) { textureStore(layout.$.outputTexture,at,vec4f(0));return; }
  let luma=clamp(p.lumaStrength,0.0,1.0);let chroma=clamp(p.chromaStrength,0.0,1.0);let radius=i32(clamp(p.radius,1u,4u));
  let sigmaY=0.01+0.08*luma;let sigmaC=0.01+0.08*chroma;var sum=vec3f(0);var weights=vec2f(0);
  for (var y=-radius;y<=radius;y++) { for (var x=-radius;x<=radius;x++) {
    let c=ycc(current(at+vec2i(x,y)));let delta=c.xyz-center.xyz;let dc=dot(delta.yz,delta.yz);
    let space=exp(-f32(x*x+y*y)/f32(2*radius*radius))*c.a;
    let wy=space*exp(-delta.x*delta.x/(2.0*sigmaY*sigmaY)-dc/0.02);
    let wc=space*exp(-dc/(2.0*sigmaC*sigmaC)-delta.x*delta.x/0.0072);
    sum+=c.xyz*vec3f(wy,wc,wc);weights+=vec2f(wy,wc);
  } }
  let filtered=center.xyz+vec3f(luma,chroma,chroma)*(sum/vec3f(weights.x,weights.y,weights.y)-center.xyz);
  textureStore(layout.$.outputTexture,at,vec4f(clamp(rgb(filtered),vec3f(0),vec3f(1))*center.a,center.a));
}`,
  io: {
    inputs: {
      source: {
        colorSpace: "encoded-sdr",
        alpha: "premultiplied",
        bindingKinds: ["texture_2d"]
      }
    },
    output: {
      colorSpace: "encoded-sdr",
      alpha: "premultiplied",
      format: "rgba8unorm",
      dimensions: "same-as:source"
    },
    rod: "same-as:source"
  }
});

const Temporal = d.struct({ strength: d.f32 });
const temporalLayout = tgpu.bindGroupLayout({
  source: { texture: "float" },
  before: { texture: "float" },
  after: { texture: "float" },
  outputTexture: { storageTexture: "rgba8unorm" },
  params: { uniform: Temporal }
});
export const filtersDenoiseTemporalV1 = defineModule({
  precision: { "source": "working", "before": "working", "after": "working", "output": "working" },
  id: "filters.denoise.temporal",
  version: 1,
  surface: "internal",
  category: "filters",
  linearity: "nonlinear-in-rgb",
  kind: "compute",
  params: Temporal,
  paramDefaults: { strength: 0 },
  layout: temporalLayout,
  workgroupSize: [8, 8, 1],
  wgsl:
    colorCode +
    /* wgsl */ `
fn neighbor(index:i32,at:vec2i)->vec4f {
  var c:vec4f;
  if (index==0) { c=textureLoad(layout.$.before,clamp(at,vec2i(0),vec2i(textureDimensions(layout.$.before))-1),0); }
  else { c=textureLoad(layout.$.after,clamp(at,vec2i(0),vec2i(textureDimensions(layout.$.after))-1),0); }
  if (c.a==0.0) { return vec4f(0); } return c;
}
fn patchOffset(i:i32)->vec2i {
  if (i==1) { return vec2i(-1,0); } if (i==2) { return vec2i(1,0); }
  if (i==3) { return vec2i(0,-1); } if (i==4) { return vec2i(0,1); } return vec2i(0);
}
fn meanColor(index:i32)->vec4f {
  let dims=vec2f(textureDimensions(layout.$.source));var sum=vec4f(0);
  for (var y=0;y<4;y++) { for (var x=0;x<4;x++) {
    let jitter=f32((x*13+y*7)%11-5)*0.04;let at=vec2i(floor((vec2f(f32(x)+0.5+jitter,f32(y)+0.5-jitter))*dims/4.0));
    var c:vec4f;if (index<0) { c=ycc(current(at)); } else { c=ycc(neighbor(index,at)); }
    sum+=vec4f(c.xyz*c.a,c.a)/16.0;
  } }
  return vec4f(sum.xyz/max(sum.a,1.0/255.0),sum.a);
}
fn patchError(index:i32,at:vec2i,offset:vec2i,reference:array<vec4f,5>)->f32 {
  var error=0.0;
  for (var i=0;i<5;i++) { let delta=ycc(neighbor(index,at+offset+patchOffset(i)))-reference[i];
    error+=(delta.x*delta.x+0.25*dot(delta.yzw,delta.yzw))/5.0; }
  return error;
}
@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) gid:vec3u) {
  let dims=textureDimensions(layout.$.source);if (any(gid.xy>=dims)) { return; }
  let at=vec2i(gid.xy);let original=textureLoad(layout.$.source,at,0);let center=current(at);
  if (center.a==0.0) { textureStore(layout.$.outputTexture,at,vec4f(0));return; }
  let centerMean=meanColor(-1);let yc=ycc(center);var sum=center.rgb;var total=1.0;
  var reference:array<vec4f,5>;for (var i=0;i<5;i++) { reference[i]=ycc(current(at+patchOffset(i))); }
  for (var index=0;index<2;index++) {
    if (index==0 && any(textureDimensions(layout.$.before)!=dims)) { continue; }
    if (index==1 && any(textureDimensions(layout.$.after)!=dims)) { continue; }
    let delta=abs(centerMean-meanColor(index));if (delta.x+0.5*(delta.y+delta.z+delta.w)>=0.08) { continue; }
    var best=patchError(index,at,vec2i(0),reference);var offset=vec2i(0);
    for (var step=4;step>=1;step/=2) {
      let origin=offset;
      for (var y=-1;y<=1;y++) { for (var x=-1;x<=1;x++) {
        let trial=clamp(origin+vec2i(x,y)*step,vec2i(-4),vec2i(4));
        let cost=patchError(index,at,trial,reference)+0.00001*f32(trial.x*trial.x+trial.y*trial.y);
        if (cost<best) { best=cost;offset=trial; }
      } }
    }
    let c=neighbor(index,at+offset);let dc=abs(ycc(c).xyz-yc.xyz);let difference=max(dc.x,max(dc.y,dc.z));
    let weight=clamp(layout.$.params.strength,0.0,1.0)*(1.0-smoothstep(0.03,0.12,sqrt(patchError(index,at,offset,reference))))
      *(1.0-smoothstep(0.08,0.2,difference))*(1.0-smoothstep(0.02,0.1,abs(c.a-center.a)));
    sum+=c.rgb*weight;total+=weight;
  }
  if (total==1.0) { textureStore(layout.$.outputTexture,at,original);return; }
  textureStore(layout.$.outputTexture,at,vec4f(clamp(sum/total,vec3f(0),vec3f(1))*center.a,center.a));
}`,
  io: {
    inputs: {
      source: {
        colorSpace: "encoded-sdr",
        alpha: "premultiplied",
        bindingKinds: ["texture_2d"]
      },
      before: {
        colorSpace: "encoded-sdr",
        alpha: "straight",
        bindingKinds: ["texture_2d"]
      },
      after: {
        colorSpace: "encoded-sdr",
        alpha: "straight",
        bindingKinds: ["texture_2d"]
      }
    },
    output: {
      colorSpace: "encoded-sdr",
      alpha: "premultiplied",
      format: "rgba8unorm",
      dimensions: "same-as:source"
    },
    rod: "same-as:source"
  }
});
