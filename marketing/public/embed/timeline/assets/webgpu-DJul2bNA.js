import{co as W,so as v}from"./vendor-mui-C0WR0pI8.js";import{c as $,h as P,u as Q}from"./context-BCViGryi.js";var j=`
// Blend mode ids (must match BLEND_MODE_INFOS[*].gpuId in blendModes.ts):
// 0 = normal, 1 = multiply, 2 = screen, 3 = overlay, 4 = darken,
// 5 = lighten, 6 = color-dodge, 7 = color-burn, 8 = hard-light,
// 9 = soft-light, 10 = difference, 11 = exclusion, 12 = add

fn softLightD(x: f32) -> f32 {
  if (x <= 0.25) {
    return ((16.0 * x - 12.0) * x + 4.0) * x;
  }
  return sqrt(x);
}

fn blendChannel(s: f32, d: f32, mode: u32) -> f32 {
  switch (mode) {
    case 0u: { return s; }
    case 1u: { return s * d; }
    case 2u: { return s + d - s * d; }
    case 3u: {
      return select(
        1.0 - 2.0 * (1.0 - s) * (1.0 - d),
        2.0 * s * d,
        d <= 0.5
      );
    }
    case 4u: { return min(s, d); }
    case 5u: { return max(s, d); }
    case 6u: {
      return select(
        min(1.0, d / max(1.0 - s, 0.001)),
        1.0,
        s >= 1.0
      );
    }
    case 7u: {
      return select(
        max(0.0, 1.0 - (1.0 - d) / max(s, 0.001)),
        0.0,
        s <= 0.0
      );
    }
    case 8u: {
      return select(
        1.0 - 2.0 * (1.0 - s) * (1.0 - d),
        2.0 * s * d,
        s <= 0.5
      );
    }
    case 9u: {
      return select(
        d + (2.0 * s - 1.0) * (softLightD(d) - d),
        d - (1.0 - 2.0 * s) * d * (1.0 - d),
        s <= 0.5
      );
    }
    case 10u: { return abs(s - d); }
    case 11u: { return s + d - 2.0 * s * d; }
    case 12u: { return min(1.0, s + d); }
    default: { return s; }
  }
}

fn applyBlendMode(src: vec3f, dst: vec3f, mode: u32) -> vec3f {
  return vec3f(
    blendChannel(src.x, dst.x, mode),
    blendChannel(src.y, dst.y, mode),
    blendChannel(src.z, dst.z, mode)
  );
}
`,k=new WeakSet,q=new WeakSet;function J(e){q.has(e)||(q.add(e),e.lost.then(()=>k.add(e)))}function K(e,o,n,s,t){if(J(e),k.has(e))throw new Error("WebGPU device lost. Recreate renderer resources before rendering.");const r=e.limits.maxTextureDimension2D;if(!Number.isInteger(o)||!Number.isInteger(n)||o<1||n<1||o>r||n>r)throw new Error(`Invalid ${o}x${n} render texture. Device limit is ${r}.`);if(t===0)throw new Error("Render texture requires a usage");if(s!=="rgba8unorm"&&s!=="rgba16float"&&s!=="bgra8unorm"&&s!=="rgba8unorm-srgb"&&s!=="bgra8unorm-srgb")throw new Error(`Unqualified render texture format: ${s}`);if(t&GPUTextureUsage.STORAGE_BINDING&&(s.endsWith("-srgb")||s==="bgra8unorm"&&!e.features.has("bgra8unorm-storage")))throw new Error(`Storage binding unavailable for ${s}`)}var V=`
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var pos = array<vec2f, 4>(
    vec2f(-1.0, -1.0),
    vec2f( 1.0, -1.0),
    vec2f(-1.0,  1.0),
    vec2f( 1.0,  1.0),
  );
  var uv = array<vec2f, 4>(
    vec2f(0.0, 1.0),
    vec2f(1.0, 1.0),
    vec2f(0.0, 0.0),
    vec2f(1.0, 0.0),
  );
  var out: VertexOutput;
  out.position = vec4f(pos[vertexIndex], 0.0, 1.0);
  out.uv = uv[vertexIndex];
  return out;
}
`,Z=`
struct BlendUniforms {
  params0: vec4f,
  invRow0: vec4f,
  invRow1: vec4f,
  invRow2: vec4f,
  params1: vec4f,
  params2: vec4f,
};

@group(0) @binding(0) var<uniform> u: BlendUniforms;
@group(0) @binding(1) var srcTexture: texture_2d<f32>;
@group(0) @binding(2) var dstTexture: texture_2d<f32>;
@group(0) @binding(3) var srcSampler: sampler;

${j}

fn sdRoundedRect(p: vec2f, b: vec2f, r: f32) -> f32 {
  let q = abs(p) - b + vec2f(r);
  return min(max(q.x, q.y), 0.0) + length(max(q, vec2f(0.0))) - r;
}

@fragment
fn fs_blend(@location(0) uv: vec2f) -> @location(0) vec4f {
  let opacity = u.params0.x;
  let blendMode = u32(u.params0.y);
  let canvasSize = u.params0.zw;
  let radius = u.params1.x;
  let smoothness = u.params1.y;
  let filterMode = u32(u.params1.z);

  // Destination = current accumulation, sampled at the screen UV (1:1).
  let dstDims = textureDimensions(dstTexture);
  let dstPx = vec2i(
    i32(clamp(floor(uv.x * f32(dstDims.x)), 0.0, f32(dstDims.x) - 1.0)),
    i32(clamp(floor(uv.y * f32(dstDims.y)), 0.0, f32(dstDims.y) - 1.0))
  );
  let dst = textureLoad(dstTexture, dstPx, 0);

  // Map screen UV → layer texel through the inverse homography.
  let px = uv * canvasSize;
  let denominator = dot(u.invRow2.xyz, vec3f(px, 1.0));
  if (abs(denominator) < 0.000001) { return dst; }
  let texel = vec2f(
    u.invRow0.x * px.x + u.invRow0.y * px.y + u.invRow0.z,
    u.invRow1.x * px.x + u.invRow1.y * px.y + u.invRow1.z
  ) / denominator;
  let dims = textureDimensions(srcTexture);
  let dimsF = vec2f(f32(dims.x), f32(dims.y));

  if (texel.x < 0.0 || texel.x >= dimsF.x || texel.y < 0.0 || texel.y >= dimsF.y) {
    return dst;
  }

  var srcRaw: vec4f;
  if (filterMode == 1u) {
    srcRaw = textureSampleLevel(srcTexture, srcSampler, texel / dimsF, 0.0);
  } else {
    let ix = i32(clamp(floor(texel.x), 0.0, max(dimsF.x - 1.0, 0.0)));
    let iy = i32(clamp(floor(texel.y), 0.0, max(dimsF.y - 1.0, 0.0)));
    srcRaw = textureLoad(srcTexture, vec2i(ix, iy), 0);
  }

  var sa = srcRaw.a * opacity;

  // Optional rounded-rect mask in layer-local [-1, 1] space.
  if (radius > 0.0) {
    let local = (texel / dimsF) * 2.0 - vec2f(1.0);
    let aspect = select(dimsF.x / dimsF.y, 1.0, dimsF.y == 0.0);
    var p = local;
    if (aspect > 1.0) {
      p.y = p.y / aspect;
    } else {
      p.x = p.x * aspect;
    }
    let halfSize = vec2f(min(1.0, aspect), min(1.0, 1.0 / aspect));
    let r = clamp(radius, 0.0, 0.5) * 2.0 * min(halfSize.x, halfSize.y);
    let dist = sdRoundedRect(p, halfSize, r);
    let mask = 1.0 - smoothstep(-smoothness, smoothness, dist);
    sa = sa * mask;
  }

  // Optional directional wipe mask in the layer's normalized quad space
  // (texel / dims), so the wipe edge rotates with the layer. c measures
  // distance from the named edge; the reveal front sits at
  // e = progress * (1 + softness), which clears the whole layer (including the
  // feather band) exactly at progress 1 and hides it all at progress 0.
  let wipeEdge = u32(u.params2.x);
  if (wipeEdge != 0u) {
    let progress = u.params2.y;
    // A tiny floor keeps smoothstep well-defined; softness 0 stays visually a
    // hard (sub-texel) edge.
    let softness = max(u.params2.z, 1e-4);
    let n = texel / dimsF;
    var c = n.x; // 1u: reveal from the left edge
    if (wipeEdge == 2u) {
      c = 1.0 - n.x; // from the right edge
    } else if (wipeEdge == 3u) {
      c = n.y; // from the top edge (texel row 0)
    } else if (wipeEdge == 4u) {
      c = 1.0 - n.y; // from the bottom edge
    }
    let e = progress * (1.0 + softness);
    sa = sa * (1.0 - smoothstep(e - softness, e, c));
  }

  // Radial iris reveal, in the layer's own normalized space.
  let irisProgress = u.params2.w;
  if (irisProgress >= 0.0) {
    let p = (texel / dimsF - vec2f(0.5)) * 2.0;
    let radial = length(p);
    let feather = max(u.params1.w, 0.0001);
    let edge = irisProgress * (1.41421356 + feather);
    let iris = 1.0 - smoothstep(edge - feather, edge, radial);
    sa = sa * select(iris, 0.0, irisProgress <= 0.0);
  }

  if (sa <= 0.0) {
    return dst;
  }

  let da = dst.a;
  let sc = srcRaw.rgb;
  // Canvas lighter adds premultiplied channels and alpha. Applying a
  // saturated straight-color sum inside source-over loses translucent light.
  if (blendMode == 12u) {
    return min(vec4f(sc * sa + dst.rgb, sa + da), vec4f(1.0));
  }
  // The accumulator stores premultiplied color (ad*Cd); the W3C formula needs
  // straight Cd, so divide RGB by alpha before calling the blend functions.
  // Non-normal modes (multiply, overlay, ...) silently produced wrong values
  // before this un-premultiply was added.
  let dc = select(vec3f(0.0), dst.rgb / max(da, 1.0 / 65535.0), da > 0.0);
  let blended = applyBlendMode(sc, dc, blendMode);

  // W3C compositing in premul-output form:
  //   Co_premul = as*(1 - ad)*Cs + as*ad*B(Cs, Cd) + (1 - as)*ad*Cd
  // The third term (1 - as)*ad*Cd_straight equals (1 - as)*dst.rgb because
  // dst.rgb is already premultiplied (ad*Cd).
  let co = sa * (1.0 - da) * sc + sa * da * blended + (1.0 - sa) * dst.rgb;
  let ao = sa + da * (1.0 - sa);
  return vec4f(co, ao);
}
`,H=`
@group(0) @binding(0) var blitTexture: texture_2d<f32>;

@fragment
fn fs_blit(@location(0) uv: vec2f) -> @location(0) vec4f {
  let dims = textureDimensions(blitTexture);
  let px = vec2i(
    i32(clamp(floor(uv.x * f32(dims.x)), 0.0, f32(dims.x) - 1.0)),
    i32(clamp(floor(uv.y * f32(dims.y)), 0.0, f32(dims.y) - 1.0))
  );
  return textureLoad(blitTexture, px, 0);
}
`,ee=`
@group(0) @binding(0) var srcTexture: texture_2d<f32>;

@fragment
fn fs_unpremultiply(@location(0) uv: vec2f) -> @location(0) vec4f {
  let dims = textureDimensions(srcTexture);
  let px = vec2i(
    i32(clamp(floor(uv.x * f32(dims.x)), 0.0, f32(dims.x) - 1.0)),
    i32(clamp(floor(uv.y * f32(dims.y)), 0.0, f32(dims.y) - 1.0))
  );
  let c = textureLoad(srcTexture, px, 0);
  if (c.a <= 0.0) {
    return vec4f(0.0, 0.0, 0.0, 0.0);
  }
  // The resolve target is RGBA8. Round before device-dependent UNORM storage
  // conversion so half-byte alpha divisions match the CPU pixel surface.
  let straight = vec4f(c.rgb / c.a, c.a);
  return floor(straight * 255.0 + vec4f(0.5)) / 255.0;
}
`;W();var X=Q({params0:P,invRow0:P,invRow1:P,invRow2:P,params1:P,params2:P}),te=$.bindGroupLayout({u:{uniform:X},srcTexture:{texture:"float"},dstTexture:{texture:"float"},srcSampler:{sampler:"filtering"}}),se=$.bindGroupLayout({blitTexture:{texture:"float"}});function fe(e,o,n,s,t){const r={x:0,y:0,width:s,height:t},i=e.a,l=e.b,u=e.tx,f=e.c,p=e.d,d=e.ty,c=e.p??0,M=e.q??0,G=e.r??1,x=i*(p*G-d*M)-l*(f*G-d*c)+u*(f*M-p*c);if(!Number.isFinite(x)||Math.abs(x)<1e-12)return r;const L=(p*G-d*M)/x,B=(u*M-l*G)/x,_=(l*d-u*p)/x,U=(d*c-f*G)/x,b=(i*G-u*c)/x,E=(u*f-i*d)/x,R=(f*M-p*c)/x,w=(l*c-i*M)/x,a=(i*p-l*f)/x;let h=1/0,m=1/0,g=-1/0,T=-1/0,y=0;for(const[N,O]of[[0,0],[o,0],[0,n],[o,n]]){const A=R*N+w*O+a;if(!(Math.abs(A)>1e-12))return r;if(y===0)y=Math.sign(A);else if(Math.sign(A)!==y)return r;const I=(L*N+B*O+_)/A,D=(U*N+b*O+E)/A;I<h&&(h=I),I>g&&(g=I),D<m&&(m=D),D>T&&(T=D)}const C=Math.max(0,Math.floor(h)-1),S=Math.max(0,Math.floor(m)-1),F=Math.min(s,Math.ceil(g)+1),z=Math.min(t,Math.ceil(T)+1);return F>C&&z>S?{x:C,y:S,width:F-C,height:z-S}:null}var re={a:1,b:0,tx:0,c:0,d:1,ty:0};function pe(e,o,n,s,t){return oe(e,o,n,s,t)??{...re}}function oe(e,o,n,s,t){if(o<=0||n<=0||s<=0||t<=0)return null;if(e[3]!==0||e[7]!==0||e[15]!==1){const b=s/2*(e[0]+e[3]),E=s/2*(e[4]+e[7]),R=s/2*(e[12]+e[15]),w=t/2*(e[3]-e[1]),a=t/2*(e[7]-e[5]),h=t/2*(e[15]-e[13]),m=e[3],g=e[7],T=e[15],y=b*(a*T-h*g)-E*(w*T-h*m)+R*(w*g-a*m);if(Math.abs(y)<1e-12)return null;const C=(a*T-h*g)/y,S=(R*g-E*T)/y,F=(E*h-R*a)/y,z=(h*m-w*T)/y,N=(b*T-R*m)/y,O=(R*w-b*h)/y,A=(w*g-a*m)/y,I=(E*m-b*g)/y,D=(b*a-E*w)/y;return{a:o/2*(C+A),b:o/2*(S+I),tx:o/2*(F+D),c:n/2*(A-z),d:n/2*(I-N),ty:n/2*(D-O),p:A,q:I,r:D}}const r=e[0],i=e[4],l=e[1],u=e[5],f=e[12],p=e[13],d=r*u-i*l;if(Math.abs(d)<1e-12)return null;const c=u/d,M=-i/d,G=-l/d,x=r/d,L=(b,E)=>{const R=b*2/s-1,w=1-E*2/t,a=R-f,h=w-p,m=c*a+M*h,g=G*a+x*h;return{x:(m+1)*o/2,y:(1-g)*n/2}},B=L(0,0),_=L(1,0),U=L(0,1);return{a:_.x-B.x,b:U.x-B.x,tx:B.x,c:_.y-B.y,d:U.y-B.y,ty:B.y}}var ne=.01,ie=class{constructor(e,o,n="nearest",s="layer-compositor"){v(this,"device",void 0),v(this,"format",void 0),v(this,"root",void 0),v(this,"blendBindGroupLayout",void 0),v(this,"blendPipeline",void 0),v(this,"blitBindGroupLayout",void 0),v(this,"blitPipeline",void 0),v(this,"sampler",void 0),v(this,"filterMode",void 0),v(this,"pingPongA",null),v(this,"pingPongB",null),v(this,"widthPx",0),v(this,"heightPx",0),v(this,"uniformBuffers",[]),v(this,"passIndex",0),this.device=e,this.format=o,this.filterMode=n==="linear"?1:0,this.root=$.initFromDevice({device:e}),this.sampler=e.createSampler({label:`${s}-sampler`,magFilter:n,minFilter:n,addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"}),this.blendBindGroupLayout=this.root.unwrap(te);const t=e.createShaderModule({label:`${s}-blend-frag`,code:V+Z});this.blendPipeline=e.createRenderPipeline({label:`${s}-blend-pipeline`,layout:e.createPipelineLayout({bindGroupLayouts:[this.blendBindGroupLayout]}),vertex:{module:t,entryPoint:"vs_main"},fragment:{module:t,entryPoint:"fs_blend",targets:[{format:o}]},primitive:{topology:"triangle-strip"}}),this.blitBindGroupLayout=this.root.unwrap(se);const r=e.createShaderModule({label:`${s}-blit-frag`,code:V+H});this.blitPipeline=e.createRenderPipeline({label:`${s}-blit-pipeline`,layout:e.createPipelineLayout({bindGroupLayouts:[this.blitBindGroupLayout]}),vertex:{module:r,entryPoint:"vs_main"},fragment:{module:r,entryPoint:"fs_blit",targets:[{format:o}]},primitive:{topology:"triangle-strip"}})}get width(){return this.widthPx}get height(){return this.heightPx}get textureA(){return this.pingPongA}get textureB(){return this.pingPongB}ensureSize(e,o){if(this.pingPongA&&this.widthPx===e&&this.heightPx===o)return;const n=Math.max(1,e),s=Math.max(1,o),t=GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_SRC|GPUTextureUsage.COPY_DST;K(this.device,n,s,this.format,t);const r=this.device.createTexture({label:"layer-compositor-ping-A",size:{width:n,height:s},format:this.format,usage:t});let i;try{i=this.device.createTexture({label:"layer-compositor-ping-B",size:{width:n,height:s},format:this.format,usage:t})}catch(l){throw r.destroy(),l}this.pingPongA?.destroy(),this.pingPongB?.destroy(),this.pingPongA=r,this.pingPongB=i,this.widthPx=e,this.heightPx=o}beginFrame(){this.passIndex=0}renderBlendPass(e,o,n,s){this.encodeBlendPass(e,o,n,s,null)}renderBlendPassInRect(e,o,n,s,t){const r=Math.floor(t.x/2)*2,i=Math.floor(t.y/2)*2;t={x:r,y:i,width:Math.min(o.width,Math.ceil((t.x+t.width)/2)*2)-r,height:Math.min(o.height,Math.ceil((t.y+t.height)/2)*2)-i},e.copyTextureToTexture({texture:o,origin:{x:t.x,y:t.y}},{texture:n,origin:{x:t.x,y:t.y}},{width:t.width,height:t.height}),this.encodeBlendPass(e,n,o,s,t)}encodeBlendPass(e,o,n,s,t){const{invAffine:r}=s,i=s.borderRadius??0,l=i>0?ne:0,u=this.passIndex++;let f=this.uniformBuffers[u];f||(f=this.root.createBuffer(X).$usage("uniform").$name(`layer-compositor-uniform-${u}`),this.uniformBuffers[u]=f);const p=s.wipe;f.write({params0:P(s.opacity,s.blendModeId,s.canvasW,s.canvasH),invRow0:P(r.a,r.b,r.tx,0),invRow1:P(r.c,r.d,r.ty,0),invRow2:P(r.p??0,r.q??0,r.r??1,0),params1:P(i,l,this.filterMode,s.iris?.softness??0),params2:p?P(p.edge,p.progress,p.softness,s.iris?.progress??-1):P(0,0,0,s.iris?.progress??-1)});const d=this.device.createBindGroup({layout:this.blendBindGroupLayout,entries:[{binding:0,resource:{buffer:f.buffer}},{binding:1,resource:s.source.createView()},{binding:2,resource:o.createView()},{binding:3,resource:this.sampler}]}),c=e.beginRenderPass({colorAttachments:[{view:n.createView(),loadOp:t?"load":"clear",storeOp:"store"}]});c.setPipeline(this.blendPipeline),c.setBindGroup(0,d),t&&c.setScissorRect(t.x,t.y,t.width,t.height),c.draw(4),c.end()}blit(e,o,n){const s=this.device.createBindGroup({layout:this.blitBindGroupLayout,entries:[{binding:0,resource:o.createView()}]}),t=e.beginRenderPass({colorAttachments:[{view:n,loadOp:"clear",storeOp:"store"}]});t.setPipeline(this.blitPipeline),t.setBindGroup(0,s),t.draw(4),t.end()}dispose(){this.pingPongA?.destroy(),this.pingPongB?.destroy(),this.pingPongA=null,this.pingPongB=null,this.uniformBuffers=[],this.root.destroy()}};function ae(e,o,n,s){const t=Math.max(1,e),r=Math.max(1,o),i=Math.max(1,n),l=Math.max(1,s),u=Math.min(i/t,l/r,1);return{x:i/2,y:l/2,scaleX:u,scaleY:u,rotation:0}}var le={a:1,b:0,tx:0,c:0,d:1,ty:0};function de(e,o,n){const s=e.scaleX,t=e.scaleY;if(s===0||t===0)return{...le};const r=Math.cos(e.rotation),i=Math.sin(e.rotation),l=o/2,u=n/2,f=r/s,p=i/s,d=-i/t,c=r/t;return{a:f,b:p,tx:l-f*e.x-p*e.y,c:d,d:c,ty:u-d*e.x-c*e.y}}var Y=256;async function he(e,o,n,s){const t=Math.max(1,Math.floor(n)),r=Math.max(1,Math.floor(s)),i="rgba8unorm",l=new ie(e,i,"nearest");l.ensureSize(t,r);const u=l.textureA,f=l.textureB;if(!u||!f)throw l.dispose(),new Error("Compositor failed to allocate accumulation textures");const p=[],d=e.createCommandEncoder({label:"headless-composite"});d.beginRenderPass({colorAttachments:[{view:u.createView(),loadOp:"clear",clearValue:{r:0,g:0,b:0,a:0},storeOp:"store"}]}).end(),l.beginFrame();let c=u,M=f;for(const a of o){const h=Math.max(1,Math.floor(a.width)),m=Math.max(1,Math.floor(a.height)),g=e.createTexture({label:"headless-composite-layer",size:{width:h,height:m},format:i,usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST}),T=new Uint8Array(a.rgba.buffer,a.rgba.byteOffset,a.rgba.byteLength);e.queue.writeTexture({texture:g},T,{bytesPerRow:h*4,rowsPerImage:m},{width:h,height:m}),p.push(g);const y=a.transform??ae(h,m,t,r);l.renderBlendPass(d,c,M,{source:g,opacity:a.opacity,blendModeId:a.blendModeId,canvasW:t,canvasH:r,invAffine:de(y,h,m)});const C=c;c=M,M=C}const G=c,x=e.createTexture({label:"headless-composite-resolved",size:{width:t,height:r},format:i,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC}),L=e.createShaderModule({label:"headless-composite-unpremultiply",code:`${V}
${ee}`}),B=e.createRenderPipeline({label:"headless-composite-unpremultiply",layout:"auto",vertex:{module:L,entryPoint:"vs_main"},fragment:{module:L,entryPoint:"fs_unpremultiply",targets:[{format:i}]},primitive:{topology:"triangle-strip"}}),_=d.beginRenderPass({colorAttachments:[{view:x.createView(),loadOp:"clear",clearValue:{r:0,g:0,b:0,a:0},storeOp:"store"}]});_.setPipeline(B),_.setBindGroup(0,e.createBindGroup({layout:B.getBindGroupLayout(0),entries:[{binding:0,resource:G.createView()}]})),_.draw(4),_.end();const U=Math.ceil(t*4/Y)*Y,b=e.createBuffer({label:"headless-composite-readback",size:U*r,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});d.copyTextureToBuffer({texture:x},{buffer:b,bytesPerRow:U,rowsPerImage:r},{width:t,height:r}),e.queue.submit([d.finish()]),await b.mapAsync(GPUMapMode.READ);const E=new Uint8Array(b.getMappedRange()),R=new Uint8Array(t*r*4),w=t*4;for(let a=0;a<r;a++)R.set(E.subarray(a*U,a*U+w),a*w);b.unmap(),b.destroy(),x.destroy();for(const a of p)a.destroy();return l.dispose(),{rgba:R,width:t,height:r}}export{pe as a,Z as c,ee as d,K as f,ie as i,H as l,ae as n,oe as o,de as r,fe as s,he as t,V as u};
