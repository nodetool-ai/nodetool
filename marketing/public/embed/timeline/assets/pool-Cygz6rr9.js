import{co as wr,so as kr}from"./vendor-mui-C0WR0pI8.js";import{_ as Q,c as t,d as $r,f as Sr,g as e,h as p,l as K,m as M,p as P,u as i}from"./context-BCViGryi.js";var _r=["premul: ok","premul: linear-safe","premul: handled"],Mr=new RegExp(`\\b(?:${["pow","log","log2","exp","exp2","sqrt","smoothstep","step","floor","ceil","round","trunc","fract"].join("|")})\\s*\\(`),Ar=/\.rgb\b/,Gr=/\b(?:let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?::[^=\n]+)?=\s*(?:textureSample|textureLoad)\b/g;function Pr(){return{}.NODETOOL_GPU_VALIDATE==="off"}function E(r){const a=r.indexOf("//");if(a===-1)return!1;const o=r.slice(a).toLowerCase();return _r.some(c=>o.includes(c))}function Ur(r){const a=new Set;for(const o of r.matchAll(Gr))a.add(o[1]);return a}function Dr(r,a){const o=/\btexture(?:Sample|Load)\b/.exec(r);if(o&&/\)\s*\.rgb\b/.test(r.slice(o.index)))return!0;for(const c of a)if(new RegExp(`(?<![.\\w])${c}\\.rgb\\b`).test(r))return!0;return!1}function Lr(r,a){if(/unpremul/i.test(r)||/\.rgb\s*\/\s*/.test(r)||/\.[rgb]\s*\/\s*[A-Za-z_]/.test(r))return!0;const o=Object.keys(a);return o.length===0?!0:o.every(c=>a[c].alpha==="straight")}function zr(r){const a=[],o=r.split(`
`);for(let c=0;c<o.length;c++){const m=o[c];if(E(m)||!/\b(?:return|textureStore)\b/.test(m))continue;const g=O(m);/\bvec4(?:<f32>|f)\s*\(\s*0(?:\.0+)?\s*,\s*0(?:\.0+)?\s*,\s*0(?:\.0+)?\s*,/.test(g)||/\bvec4(?:<f32>|f)\s*\(\s*0(?:\.0+)?\s*\)/.test(g)||/\bvec4(?:<f32>|f)\s*\(/.test(g)&&(/\.rgb\b/.test(g)||/\.(?:r|g|b)\b/.test(g))&&a.push(`line ${c+1}: alpha-only module writes non-zero RGB to output (\`${m.trim()}\`)`)}return a}function Rr(r){const a=[],o=r.split(`
`);for(let c=0;c<o.length;c++){const m=o[c];if(E(m))continue;const g=O(m);Ar.test(g)&&Mr.test(g)&&a.push(`line ${c+1}: linear-in-rgb module applies nonlinear op to \`.rgb\` (\`${m.trim()}\`)`)}return a}function Tr(r,a){if(Lr(r,a))return[];const o=Ur(r);if(o.size===0&&!/\btexture(?:Sample|Load)\b[\s\S]*\.rgb\b/.test(r))return[];const c=[],m=r.split(`
`);for(let g=0;g<m.length;g++){const h=m[g];E(h)||Dr(O(h),o)&&c.push(`line ${g+1}: nonlinear-in-rgb module reads \`.rgb\` from a premul sample without an unpremul handshake (\`${h.trim()}\`)`)}return c.length===0?[]:["module tagged `nonlinear-in-rgb` but no `unpremul` / `.rgb /` divide / all-straight-inputs handshake found",...c]}function O(r){const a=r.indexOf("//");return a===-1?r:r.slice(0,a)}function V(r){if(Pr())return{ok:!0,violations:[]};const{linearity:a,wgsl:o,inputs:c}=r;let m=[];switch(a){case"source":break;case"alpha-only":m=zr(o);break;case"linear-in-rgb":m=Rr(o);break;case"nonlinear-in-rgb":m=Tr(o,c);break;default:}return{ok:m.length===0,violations:m}}var Hi="params";function s(r){if(!r.id)throw new Error("defineModule: id is required");if(!Number.isInteger(r.version)||r.version<1)throw new Error(`defineModule(${r.id}): version must be a positive integer`);const a=r.kind??"fragment",o=t.resolve({template:r.wgsl,externals:{layout:r.layout,...r.externals},names:"strict"}),c=V({id:r.id,linearity:r.linearity,wgsl:o,inputs:r.io.inputs});if(!c.ok)throw new Error(`defineModule(${r.id}): premul-invariant validation failed:
  - ${c.violations.join(`
  - `)}`);const m=r.variants?.map(h=>{const S=h.rawWgsl?h.wgsl:t.resolve({template:h.wgsl,externals:{layout:h.layout,...h.externals},names:"strict"}),_=V({id:`${r.id}#${h.name}`,linearity:r.linearity,wgsl:S,inputs:r.io.inputs});if(!_.ok)throw new Error(`defineModule(${r.id}, variant=${h.name}): premul-invariant validation failed:
  - ${_.violations.join(`
  - `)}`);return Object.freeze({name:h.name,bindingKinds:h.bindingKinds,requires:h.requires,layout:h.layout,wgsl:S,entryPoint:h.entryPoint??(a==="compute"?"main":"fs_main"),samplers:h.samplers,workgroupSize:h.workgroupSize})}),g=r.workingWgsl===void 0?void 0:t.resolve({template:r.workingWgsl,externals:{layout:r.layout,...r.externals},names:"strict"});if(g!==void 0){const h=V({id:r.id,linearity:r.linearity,wgsl:g,inputs:r.io.inputs});if(!h.ok)throw new Error(`defineModule(${r.id}): FP16 premul-invariant validation failed: ${h.violations.join(", ")}`)}return Object.freeze({id:r.id,version:r.version,surface:r.surface,category:r.category,kind:a,linearity:r.linearity,params:r.params,paramDefaults:r.paramDefaults,paramUi:r.paramUi,layout:r.layout,uniformBinding:r.uniformBinding??"params",samplers:r.samplers??{},wgsl:o,workingWgsl:g,entryPoint:r.entryPoint??(a==="compute"?"main":"fs_main"),workgroupSize:r.workgroupSize??[1,1,1],precision:r.precision,io:r.io,variants:m?Object.freeze(m):void 0})}function A(r,a){return`${r}@${a}`}wr();var Cr=class{constructor(){kr(this,"byKey",new Map)}register(r){const a=A(r.id,r.version);if(this.byKey.has(a))throw new Error(`Shader module already registered: ${a}`);this.byKey.set(a,r)}registerAll(r){for(const a of r)this.register(a)}tryGet(r){const a=r.version!==void 0?this.byKey.get(A(r.id,r.version)):this.latest(r.id);if(a&&!(r.surface&&a.surface!==r.surface))return a}get(r){const a=this.tryGet(r);if(!a){const o=r.version!==void 0?`@${r.version}`:"",c=r.surface?` (surface=${r.surface})`:"";throw new Error(`Shader module not found: ${r.id}${o}${c}`)}return a}getShader(r){const a=this.get(r);if(a.kind==="recipe")throw new Error(`Shader registry: ${a.id}@${a.version} is a recipe; use getRecipe or RecipeRunner`);return a}getRecipe(r){const a=this.get(r);if(a.kind!=="recipe")throw new Error(`Shader registry: ${a.id}@${a.version} is a single-pass module; use getShader or Executor`);return a}has(r){return this.tryGet(r)!==void 0}list(r={}){const a=[];for(const o of this.byKey.values())r.surface&&o.surface!==r.surface||r.category&&o.category!==r.category||a.push(o);return a}latest(r){let a;for(const o of this.byKey.values())o.id===r&&(!a||o.version>a.version)&&(a=o);return a}};function I(r){const a=[...Object.keys(r.io.inputs),"output"].sort();if(!r.precision||JSON.stringify(Object.keys(r.precision).sort())!==JSON.stringify(a))throw new Error(`${r.id}: unclassified precision slots`)}var j=new WeakMap;function Vr(r,a){if(a==="rgba8unorm"||(I(r),r.precision?.output==="fixed"))return r;const o=j.get(r);if(o)return o;const c=g=>({layout:t.bindGroupLayout(Object.fromEntries(Object.entries(g.layout.entries).map(([h,S])=>{if(!S||!("storageTexture"in S))return[h,S];if(S.storageTexture.format!=="rgba8unorm"||S.storageTexture.dimension!=="2d"||S.storageTexture.access!=="write-only")throw new Error(`${r.id}: unsupported storage binding ${h}`);return[h,{...S,storageTexture:a}]}))),wgsl:(g.workingWgsl??g.wgsl).replaceAll("texture_storage_2d<rgba8unorm","texture_storage_2d<rgba16float")}),m={...r,...c(r),io:{...r.io,output:{...r.io.output,format:a}},variants:r.variants?.map(g=>({...g,...c(g)}))};return j.set(r,m),m}function ee(r,a,o){if(a==="rgba8unorm")return;I(r);const c=r.precision?.output!=="fixed"?a:r.io.output.format;if(o!==c)throw new Error(`${r.id}: fixed-byte working slot or incompatible fixed output: expected ${c}, got ${o}`)}var H=new WeakMap,B=16,Br=`
struct Counters {
  rgbExceedsA: atomic<u32>,
  negative: atomic<u32>,
  nan: atomic<u32>,
  totalChecked: atomic<u32>,
};
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> counters: Counters;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(src);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let c = textureLoad(src, vec2i(i32(gid.x), i32(gid.y)), 0);
  atomicAdd(&counters.totalChecked, 1u);
  let eps = 1.0 / 255.0;
  if (c.r != c.r || c.g != c.g || c.b != c.b || c.a != c.a) {
    atomicAdd(&counters.nan, 1u);
    return;
  }
  if (c.r < -eps || c.g < -eps || c.b < -eps || c.a < -eps) {
    atomicAdd(&counters.negative, 1u);
  }
  if (c.r > c.a + eps || c.g > c.a + eps || c.b > c.a + eps) {
    atomicAdd(&counters.rgbExceedsA, 1u);
  }
}
`,F=null;function Fr(){const r={}.NODETOOL_GPU_DEBUG;return r?r.split(",").map(a=>a.trim().toLowerCase()).includes("premul"):!1}function Kr(){return F===null&&(F=Fr()),F}var q=new WeakMap,N=new WeakMap;function Er(r){let a=q.get(r),o=N.get(r);if(a&&o)return{pipeline:a,bindGroupLayout:o};o=r.createBindGroupLayout({label:"premul-validator-bgl",entries:[{binding:0,visibility:GPUShaderStage.COMPUTE,texture:{sampleType:"float",viewDimension:"2d"}},{binding:1,visibility:GPUShaderStage.COMPUTE,buffer:{type:"storage"}}]});const c=r.createShaderModule({label:"premul-validator-shader",code:Br});return a=r.createComputePipeline({label:"premul-validator-pipeline",layout:r.createPipelineLayout({bindGroupLayouts:[o]}),compute:{module:c,entryPoint:"main"}}),q.set(r,a),N.set(r,o),{pipeline:a,bindGroupLayout:o}}function Or(r){const{ctx:a,module:o,encoder:c,output:m}=r;if((m.texture.usage&GPUTextureUsage.TEXTURE_BINDING)===0)return;const{device:g}=a,{pipeline:h,bindGroupLayout:S}=Er(g),_=g.createBuffer({label:"premul-validator-counters",size:B,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST});g.queue.writeBuffer(_,0,new Uint32Array([0,0,0,0]));const G=g.createBuffer({label:"premul-validator-readback",size:B,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),D=g.createBindGroup({label:"premul-validator-bindgroup",layout:S,entries:[{binding:0,resource:m.createView()},{binding:1,resource:{buffer:_}}]}),U=c.beginComputePass({label:"premul-validator-pass"});U.setPipeline(h),U.setBindGroup(0,D);const l=Math.ceil(m.width/8),u=Math.ceil(m.height/8);U.dispatchWorkgroups(Math.max(1,l),Math.max(1,u),1),U.end(),c.copyBufferToBuffer(_,0,G,0,B);let d=H.get(a);d||(d=[],H.set(a,d)),d.push({moduleKey:A(o.id,o.version),buffer:G,countersBuffer:_})}var Ir=`
struct FullscreenVertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> FullscreenVertexOutput {
  var positions = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f( 3.0, -1.0),
    vec2f(-1.0,  3.0),
  );
  let pos = positions[vertexIndex];
  var out: FullscreenVertexOutput;
  out.position = vec4f(pos, 0.0, 1.0);
  // Map clip-space [-1,1] to UV [0,1] with top-left origin (flip Y).
  out.uv = vec2f((pos.x + 1.0) * 0.5, (1.0 - pos.y) * 0.5);
  return out;
}
`,Wr="vs_main",jr=`fn decode(v: vec3f) -> vec3f {
  return select(pow((v + 0.055) / 1.055, vec3f(2.4)), v / 12.92, v <= vec3f(0.04045));
}
fn encode(v: vec3f) -> vec3f {
  return select(1.055 * pow(v, vec3f(1.0 / 2.4)) - 0.055, 12.92 * v, v <= vec3f(0.0031308));
}
`,Hr="c.rgb * c.a",qr="c.rgb / c.a",Nr="c.a <= 0.0",Yr="src.rgb / max(src.a, 1.0 / 255.0)",Xr=i({_unused:e}),Zr=t.bindGroupLayout({source:{texture:"float"},outputTexture:{storageTexture:"rgba8unorm"}}),re=s({precision:{source:"working",output:"working"},id:"alpha.premulToStraight",version:1,surface:"internal",category:"alpha",linearity:"nonlinear-in-rgb",kind:"compute",params:Xr,paramDefaults:{_unused:0},layout:Zr,workgroupSize:[16,16,1],wgsl:`
@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(layout.$.source);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let coords = vec2<i32>(i32(gid.x), i32(gid.y));
  let c = textureLoad(layout.$.source, coords, 0);
  if (${Nr}) {
    textureStore(layout.$.outputTexture, coords, vec4<f32>(0.0));
    return;
  }
  textureStore(layout.$.outputTexture, coords, vec4<f32>(${qr}, c.a));
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]}},output:{colorSpace:"encoded-sdr",alpha:"straight",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),Jr=i({_unused:e}),Qr=t.bindGroupLayout({source:{texture:"float"},outputTexture:{storageTexture:"rgba8unorm"}}),ae=s({precision:{source:"working",output:"working"},id:"alpha.straightToPremul",version:1,surface:"internal",category:"alpha",linearity:"linear-in-rgb",kind:"compute",params:Jr,paramDefaults:{_unused:0},layout:Qr,workgroupSize:[16,16,1],wgsl:`
@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(layout.$.source);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let coords = vec2<i32>(i32(gid.x), i32(gid.y));
  let c = textureLoad(layout.$.source, coords, 0);
  textureStore(layout.$.outputTexture, coords, vec4<f32>(${Hr}, c.a));
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"straight",bindingKinds:["texture_2d"]}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}});function ea(r,a){const o=r.bindingKinds;if(!o)return!0;for(const[c,m]of Object.entries(o)){const g=a[c];if(g&&g.meta.bindingKind!==m)return!1}return!0}function ra(r,a){const o=r.requires;return o?!(o.shaderF16&&!a.shaderF16||o.textureExternal&&!a.textureExternal||o.f16Storage&&!a.f16Storage):!0}function aa(r,a,o){const c={layout:r.layout,wgsl:r.wgsl,entryPoint:r.entryPoint,samplers:r.samplers,workgroupSize:r.workgroupSize,variant:void 0};if(!r.variants||r.variants.length===0)return c;for(const m of r.variants)if(ea(m,a)&&ra(m,o))return{layout:m.layout,wgsl:m.wgsl,entryPoint:m.entryPoint,samplers:m.samplers??{},workgroupSize:m.workgroupSize??r.workgroupSize,variant:m.name};return c}function ta(){const r=new WeakMap;function a(l,u){let d=r.get(l);d||(d=new Map,r.set(l,d));const b=JSON.stringify(u);let n=d.get(b);return n||(n=l.createSampler(u),d.set(b,n)),n}function o(l,u){for(const[d,b]of Object.entries(l.io.inputs)){const n=u[d];if(!n){if(b.optional)continue;throw new Error(`${A(l.id,l.version)}: missing required input "${d}"`)}if(!b.bindingKinds.includes(n.meta.bindingKind))throw new Error(`${A(l.id,l.version)}: input "${d}" has binding kind "${n.meta.bindingKind}", expected one of [${b.bindingKinds.join(", ")}]`)}}function c(l){const{ctx:u,module:d,encoder:b,inputs:n}=l,v={...n},f=[];for(const[x,y]of Object.entries(d.io.inputs)){const w=v[x];if(!w||w.meta.alpha===y.alpha)continue;const $=m(w.meta.alpha,y.alpha),k=u.scratch.acquire({width:w.width,height:w.height,exact:!0,format:l.workingFormat==="rgba16float"&&w.format==="rgba16float"?"rgba16float":"rgba8unorm",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.STORAGE_BINDING|GPUTextureUsage.COPY_SRC|GPUTextureUsage.COPY_DST,label:`alpha-convert-${d.id}-${x}`,meta:{colorSpace:w.meta.colorSpace,alpha:y.alpha,bindingKind:"texture_2d"}}),[L,R]=$.workgroupSize;U({ctx:u,module:$,workingFormat:k.format==="rgba16float"?"rgba16float":"rgba8unorm",encoder:b,inputs:{source:w},output:k,params:$.paramDefaults,dispatch:{kind:"compute",x:Math.ceil(w.width/L),y:Math.ceil(w.height/R),z:1}}),v[x]=k,f.push(k)}return{inputs:v,scratchToRelease:f}}function m(l,u){if(l==="straight"&&u==="premultiplied")return ae;if(l==="premultiplied"&&u==="straight")return re;throw new Error(`no alpha convert module for ${l} → ${u}`)}function g(l,u,d,b,n,v){const f=[];let x=0;for(const[y,w]of Object.entries(d.layout.entries)){const $=x++;if(w)if("uniform"in w){if(!v)throw new Error(`${A(u.id,u.version)}: layout declares uniform "${y}" but module has no params`);f.push({binding:$,resource:{buffer:v}})}else if("storageTexture"in w)f.push({binding:$,resource:n.createView()});else if("texture"in w||"externalTexture"in w){const k=b[y];if(k){f.push({binding:$,resource:k.createView()});continue}const L=u.io.inputs[y];if(!L)throw new Error(`${A(u.id,u.version)}: layout binds texture "${y}" but it is not declared in io.inputs`);if(!L.optional)throw new Error(`${A(u.id,u.version)}: no texture bound for required input "${y}"`);f.push({binding:$,resource:l.getDefaultWhiteTexture().createView()})}else if("sampler"in w){const k=d.samplers[y];if(!k)throw new Error(`${A(u.id,u.version)}: no sampler descriptor for "${y}"`);f.push({binding:$,resource:a(l.device,k)})}else throw new Error(`${A(u.id,u.version)}: unsupported layout entry "${y}"`)}return l.device.createBindGroup({label:`${u.id}-bindgroup`,layout:l.root.unwrap(d.layout),entries:f})}function h(l,u,d,b){const n=d.variant?`:${d.variant}`:"",v=`${A(u.id,u.version)}${n}:fragment:${b}`,f=l.pipelineCache.get(v);if(f)return f;const x=l.device.createShaderModule({label:`${u.id}-shader`,code:`${Ir}
${d.wgsl}`}),y=l.device.createRenderPipeline({label:`${u.id}-pipeline`,layout:l.device.createPipelineLayout({bindGroupLayouts:[l.root.unwrap(d.layout)]}),vertex:{module:x,entryPoint:Wr},fragment:{module:x,entryPoint:d.entryPoint,targets:[{format:b}]},primitive:{topology:"triangle-list"}});return l.pipelineCache.set(v,y),y}function S(l,u,d){const b=d.variant?`:${d.variant}`:"",n=`${A(u.id,u.version)}${b}:compute:${u.io.output.format}`,v=l.pipelineCache.get(n);if(v)return v;const f=l.device.createShaderModule({label:`${u.id}-shader`,code:d.wgsl}),x=l.device.createComputePipeline({label:`${u.id}-pipeline`,layout:l.device.createPipelineLayout({bindGroupLayouts:[l.root.unwrap(d.layout)]}),compute:{module:f,entryPoint:d.entryPoint}});return l.pipelineCache.set(n,x),x}function _(l,u,d,b){if(!Object.values(d.layout.entries).some(x=>x!==null&&"uniform"in x))return null;const n=Sr(u.params),v=new ArrayBuffer(n);$r(v,u.params,b);const f=l.uniformRing.acquire(n);return l.device.queue.writeBuffer(f,0,v),f}function G(l,u){const{ctx:d,module:b,encoder:n,inputs:v,output:f,params:x}=l,y=g(d,b,u,v,f,_(d,b,u,x)),w=h(d,b,u,f.format),$=n.beginRenderPass({label:`${b.id}-pass`,colorAttachments:[{view:f.createView(),loadOp:"clear",storeOp:"store"}]});$.setPipeline(w),$.setBindGroup(0,y),$.draw(3),$.end(),f.markWritten()}function D(l,u,d){const{ctx:b,module:n,encoder:v,inputs:f,output:x,params:y}=l,w=g(b,n,u,f,x,_(b,n,u,y)),$=S(b,n,u),k=v.beginComputePass({label:`${n.id}-pass`});k.setPipeline($),k.setBindGroup(0,w),k.dispatchWorkgroups(d.x,d.y,d.z??1),k.end(),x.markWritten()}function U(l){const u=l.workingFormat??"rgba8unorm";if(ee(l.module,u,l.output.format),u==="rgba16float")for(const[f,x]of Object.entries(l.module.precision??{})){const y=l.inputs[f];if(f!=="output"&&x!=="fixed"&&y&&y.format!==u)throw new Error(`${l.module.id}: fixed-byte working input ${f}; expected ${u}`)}l={...l,module:Vr(l.module,u)},o(l.module,l.inputs);const{inputs:d,scratchToRelease:b}=c(l),n={...l,inputs:d},v=aa(n.module,n.inputs,n.ctx.capabilities);try{n.dispatch.kind==="fragment"?G(n,v):D(n,v,n.dispatch),Kr()&&n.module.io.output.alpha==="premultiplied"&&Or({ctx:n.ctx,module:n.module,encoder:n.encoder,output:n.output})}finally{for(const f of b)n.ctx.scratch.release(f)}}return{encode(l){U(l)}}}function C(r){if(!r.id)throw new Error("defineRecipe: id is required");if(!Number.isInteger(r.version)||r.version<1)throw new Error(`defineRecipe(${r.id}): version must be a positive integer`);if(r.recipe.passes.length===0)throw new Error(`defineRecipe(${r.id}): recipe must have ≥1 pass`);return Object.freeze({id:r.id,version:r.version,surface:r.surface,category:r.category,kind:"recipe",paramDefaults:r.paramDefaults,paramUi:r.paramUi,precision:r.precision,io:r.io,recipe:r.recipe})}function oa(r){return typeof r=="string"&&r.startsWith("$.")}function ia(r,a){return r[a.slice(2)]}function sa(r,a){const o={};for(const[c,m]of Object.entries(r))o[c]=oa(m)?ia(a,m):m;return o}function T(r,a,o,c){if(a.resolve)return a.resolve(r.op);if(!o)throw new Error(`RecipeRunner(${c}): no registry or recipe.resolve to resolve ${r.op.id}@${r.op.version}`);return o.getShader(r.op)}function qi(){return{encode({ctx:r,module:a,encoder:o,inputs:c,output:m,params:g,registry:h,executor:S,workingFormat:_="rgba8unorm"}){const G=a.recipe,D=new Map;for(const n of G.passes)n.out!=="output"&&!D.has(n.out.name)&&D.set(n.out.name,n);if(ee(a,_,m.format),_==="rgba16float"){for(const n of a.recipe.passes)I(T(n,a.recipe,h,a.id));for(const[n,v]of Object.entries(a.recipe.intermediates)){if(!v.precision)throw new Error(`${a.id}: unclassified intermediate ${n}`);if(v.precision==="fixed"){const f=D.get(n),x=f&&T(f,a.recipe,h,a.id);if(x?.precision?.output==="working"||x?.precision?.output==="working-or-mask"&&v.role!=="mask")throw new Error(`${a.id}: fixed-byte working slot ${n}`)}}}const U=S??ta(),l=A(a.id,a.version),u=c.source;if(!u)throw new Error(`RecipeRunner(${l}): missing "source" input`);const d=new Map,b=[];try{for(const[n,v]of Object.entries(G.intermediates)){const f=D.get(n),x=f?T(f,G,h,l):void 0,y=f?.in.source,w=y==="source"?u.meta.colorSpace:y?.kind==="intermediate"?d.get(y.name)?.meta.colorSpace:y?.kind==="input"?c[y.name]?.meta.colorSpace:void 0,$={meta:{colorSpace:x?.id==="filters.blur.gaussian"?w??x.io.output.colorSpace:x?.io.output.colorSpace??u.meta.colorSpace},width:v.width??u.width,height:v.height??u.height,exact:!0,format:v.precision==="working"?_:v.format,usage:v.usage,label:v.label??`${l}-${n}`},k=r.scratch.acquire($);d.set(n,k),b.push(k)}for(const n of G.passes){const v=T(n,G,h,l),f={};for(const[$,k]of Object.entries(n.in)){if(k==="source"){f[$]=u;continue}if(k.kind==="intermediate"){const R=d.get(k.name);if(!R)throw new Error(`RecipeRunner(${l}): unknown intermediate "${k.name}"`);f[$]=R;continue}const L=c[k.name];if(!L)throw new Error(`RecipeRunner(${l}): pass binds "${$}" to recipe input "${k.name}" but that input is unbound`);f[$]=L}const x=n.out==="output"?m:d.get(n.out.name)??(()=>{throw new Error(`RecipeRunner(${l}): unknown intermediate "${n.out.name}"`)})(),y=sa(n.params,g),w=la(n,v,x);U.encode({ctx:r,module:v,encoder:o,inputs:f,output:x,params:y,dispatch:w,workingFormat:_==="rgba16float"&&!(v.precision?.output==="working-or-mask"&&n.out!=="output"&&G.intermediates[n.out.name].precision==="fixed")?_:"rgba8unorm"})}}finally{for(const n of b.reverse())r.scratch.release(n)}}}}function la(r,a,o){if(a.kind==="fragment")return{kind:"fragment"};if(a.kind!=="compute")throw new Error(`RecipeRunner: op "${a.id}@${a.version}" has unsupported kind "${a.kind}"`);const c=r.dispatch;if(c&&c.kind==="compute"){const[h,S]=a.workgroupSize;return{kind:"compute",x:c.x??Math.ceil(o.width/h),y:c.y??Math.ceil(o.height/S),z:c.z??1}}const[m,g]=a.workgroupSize;return{kind:"compute",x:Math.ceil(o.width/m),y:Math.ceil(o.height/g),z:1}}var te=i({lumaStrength:e,chromaStrength:e,radius:Q}),na=t.bindGroupLayout({source:{texture:"float"},outputTexture:{storageTexture:"rgba8unorm"},params:{uniform:te}}),oe=`
fn ycc(c:vec4f)->vec4f { let y=dot(c.rgb,vec3f(0.2126,0.7152,0.0722)); return vec4f(y,(c.b-y)/1.8556,(c.r-y)/1.5748,c.a); }
fn rgb(c:vec3f)->vec3f { let r=c.x+1.5748*c.z; let b=c.x+1.8556*c.y; return vec3f(r,(c.x-0.2126*r-0.0722*b)/0.7152,b); }
fn current(at:vec2i)->vec4f {
  let size=vec2i(textureDimensions(layout.$.source)); let c=textureLoad(layout.$.source,clamp(at,vec2i(0),size-1),0);
  return vec4f(c.rgb/max(c.a,1.0/255.0),c.a);
}
`,ua=s({precision:{source:"working",output:"working"},id:"filters.denoise.spatial",version:1,surface:"internal",category:"filters",linearity:"nonlinear-in-rgb",kind:"compute",params:te,paramDefaults:{lumaStrength:0,chromaStrength:0,radius:2},layout:na,workgroupSize:[16,16,1],wgsl:oe+`
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
}`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),ie=i({strength:e}),ca=t.bindGroupLayout({source:{texture:"float"},before:{texture:"float"},after:{texture:"float"},outputTexture:{storageTexture:"rgba8unorm"},params:{uniform:ie}}),pa=s({precision:{source:"working",before:"working",after:"working",output:"working"},id:"filters.denoise.temporal",version:1,surface:"internal",category:"filters",linearity:"nonlinear-in-rgb",kind:"compute",params:ie,paramDefaults:{strength:0},layout:ca,workgroupSize:[8,8,1],wgsl:oe+`
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
}`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]},before:{colorSpace:"encoded-sdr",alpha:"straight",bindingKinds:["texture_2d"]},after:{colorSpace:"encoded-sdr",alpha:"straight",bindingKinds:["texture_2d"]}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),se=i({a:e,b:e,x:e,c:e,e,y:e}),ma=t.bindGroupLayout({source:{texture:"float"},outputTexture:{storageTexture:"rgba8unorm"},params:{uniform:se}}),da=s({precision:{source:"working",output:"working"},id:"transform.stabilize",version:1,surface:"internal",category:"transform",linearity:"nonlinear-in-rgb",kind:"compute",params:se,paramDefaults:{a:1,b:0,x:0,c:0,e:1,y:0},layout:ma,workgroupSize:[16,16,1],wgsl:`
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
}`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),le=i({strength:e,range:Q,threshold:e,dither:e}),fa=t.bindGroupLayout({source:{texture:"float"},outputTexture:{storageTexture:"rgba8unorm"},params:{uniform:le}}),ga=s({precision:{source:"working",output:"working"},id:"filters.deband",version:1,surface:"internal",category:"filters",linearity:"nonlinear-in-rgb",kind:"compute",params:le,paramDefaults:{strength:0,range:16,threshold:.02,dither:.5},layout:fa,workgroupSize:[16,16,1],wgsl:`
fn hash01(at: vec2u, seed: u32) -> f32 {
  var h = (at.x * 1597334677u) ^ (at.y * 3812015801u) ^ (seed * 2798796415u);
  h = (h ^ (h >> 16u)) * 2246822519u; h = (h ^ (h >> 13u)) * 3266489917u; h ^= h >> 16u;
  return f32(h >> 8u) / 16777216.0;
}
@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(layout.$.source);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let at = vec2i(gid.xy); let src = textureLoad(layout.$.source, at, 0); let p = layout.$.params;
  let rgb = src.rgb / max(src.a, 1.0 / 255.0);
  var sum = rgb * src.a; var weight = src.a;
  let threshold = clamp(p.threshold, 0.0, 0.1);
  for (var ring = 1; ring <= 2; ring++) {
    let radius = 1 + i32(floor(hash01(gid.xy, u32(ring) * 1669u) * f32(clamp(p.range, 1u, 64u))));
    for (var dy = -1; dy <= 1; dy++) { for (var dx = -1; dx <= 1; dx++) {
      if (dx == 0 && dy == 0) { continue; }
      let sampleAt = clamp(at + vec2i(dx, dy) * radius, vec2i(0), vec2i(dims) - 1);
      let sample = textureLoad(layout.$.source, sampleAt, 0);
      let color = sample.rgb / max(sample.a, 1.0 / 255.0);
      let delta = abs(color - rgb); let difference = max(max(delta.r, delta.g), delta.b);
      if (sample.a > 0.0 && threshold > 0.0) {
        let w = sample.a * (1.0 - smoothstep(threshold * 0.5, threshold, difference));
        sum += color * w; weight += w;
      }
    } }
  }
  let grain = (hash01(gid.xy, 907u) - 0.5) * clamp(p.dither, 0.0, 1.0) / 255.0;
  let result = rgb + clamp(p.strength, 0.0, 1.0) * (sum / max(weight, 1.0 / 255.0) - rgb + grain);
  textureStore(layout.$.outputTexture, at, vec4f(clamp(result, vec3f(0), vec3f(1)) * src.a, src.a));
}`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),ne=i({hueCenter:e,hueWidth:e,hueSoftness:e,rangeSoftness:e,saturationMin:e,saturationMax:e,lightnessMin:e,lightnessMax:e,hueShift:e,saturation:e,lightness:e,table:K(p,256)}),va=t.bindGroupLayout({source:{texture:"float"},outputTexture:{storageTexture:"rgba8unorm"},params:{uniform:ne}}),ha=s({precision:{source:"working",output:"working"},id:"color.secondary",version:1,surface:"internal",category:"color",linearity:"nonlinear-in-rgb",kind:"compute",params:ne,paramDefaults:{hueCenter:0,hueWidth:180,hueSoftness:15,rangeSoftness:.1,saturationMin:0,saturationMax:1,lightnessMin:0,lightnessMax:1,hueShift:0,saturation:1,lightness:0,table:Array.from({length:256},()=>p(.5,.5,0,1))},layout:va,workgroupSize:[16,16,1],wgsl:`
fn toHsl(rgb: vec3f) -> vec3f {
  let hi = max(max(rgb.r, rgb.g), rgb.b); let lo = min(min(rgb.r, rgb.g), rgb.b);
  let delta = hi - lo; let l = (hi + lo) * 0.5;
  if (delta < 0.000001) { return vec3f(0, 0, l); }
  var h = (rgb.r - rgb.g) / delta + 4.0;
  if (hi == rgb.r) { h = (rgb.g - rgb.b) / delta; }
  else if (hi == rgb.g) { h = (rgb.b - rgb.r) / delta + 2.0; }
  return vec3f(fract(h / 6.0), delta / max(0.000001, 1.0 - abs(2.0 * l - 1.0)), l);
}
fn fromHsl(hsl: vec3f) -> vec3f {
  let ramp = clamp(abs(fract(vec3f(hsl.x) + vec3f(0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, vec3f(0), vec3f(1));
  return vec3f(hsl.z) + (1.0 - abs(2.0 * hsl.z - 1.0)) * hsl.y * (ramp - 0.5);
}
fn rangeMask(v: f32, low: f32, high: f32, soft: f32) -> f32 {
  if (low > high) { return 0.0; }
  if (v >= low && v <= high) { return 1.0; }
  if (soft <= 0.0) { return 0.0; }
  if (v < low) { return smoothstep(low - soft, low, v); }
  return 1.0 - smoothstep(high, high + soft, v);
}
@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(layout.$.source);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let at = vec2i(gid.xy); let src = textureLoad(layout.$.source, at, 0);
  let rgb = src.rgb / max(src.a, 1.0 / 255.0); let hsl = toHsl(rgb); let p = layout.$.params;
  let distance = abs(fract(hsl.x - p.hueCenter / 360.0 + 0.5) - 0.5) * 360.0;
  var mask = 1.0;
  if (p.hueWidth < 180.0) { mask = rangeMask(distance, 0.0, p.hueWidth, p.hueSoftness) * smoothstep(0.0, 0.01, hsl.y); }
  mask *= rangeMask(hsl.y, p.saturationMin, p.saturationMax, p.rangeSoftness)
    * rangeMask(hsl.z, p.lightnessMin, p.lightnessMax, p.rangeSoftness);
  let position = hsl.x * 255.0; let lo = u32(floor(position)); let hi = min(255u, lo + 1u);
  let curve = mix(p.table[lo].xy, p.table[hi].xy, fract(position));
  let corrected = fromHsl(vec3f(fract(hsl.x + p.hueShift / 360.0 + curve.x - 0.5),
    clamp(hsl.y * p.saturation * 2.0 * curve.y, 0.0, 1.0), clamp(hsl.z + p.lightness, 0.0, 1.0)));
  textureStore(layout.$.outputTexture, at, vec4f(clamp(mix(rgb, corrected, mask), vec3f(0), vec3f(1)) * src.a, src.a));
}`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),ue=i({table:K(p,512)}),ba=t.bindGroupLayout({source:{texture:"float"},outputTexture:{storageTexture:"rgba8unorm"},params:{uniform:ue}}),xa=s({precision:{source:"working",output:"working"},id:"color.hueSatCurves",version:1,surface:"internal",category:"color",linearity:"nonlinear-in-rgb",kind:"compute",params:ue,paramDefaults:{table:Array.from({length:512},()=>p(.5,.5,.5,1))},layout:ba,workgroupSize:[16,16,1],wgsl:`
fn toHsl(rgb: vec3f) -> vec3f {
  let hi = max(max(rgb.r, rgb.g), rgb.b); let lo = min(min(rgb.r, rgb.g), rgb.b);
  let delta = hi - lo; let l = (hi + lo) * 0.5;
  if (delta < 0.000001) { return vec3f(0, 0, l); }
  var h = (rgb.r - rgb.g) / delta + 4.0;
  if (hi == rgb.r) { h = (rgb.g - rgb.b) / delta; }
  else if (hi == rgb.g) { h = (rgb.b - rgb.r) / delta + 2.0; }
  return vec3f(fract(h / 6.0), delta / max(0.000001, 1.0 - abs(2.0 * l - 1.0)), l);
}
fn fromHsl(hsl: vec3f) -> vec3f {
  let ramp = clamp(abs(fract(vec3f(hsl.x) + vec3f(0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, vec3f(0), vec3f(1));
  return vec3f(hsl.z) + (1.0 - abs(2.0 * hsl.z - 1.0)) * hsl.y * (ramp - 0.5);
}
fn row(offset: u32, at: f32) -> vec4f {
  let position = clamp(at, 0.0, 1.0) * 255.0; let lo = u32(floor(position)); let hi = min(255u, lo + 1u);
  return mix(layout.$.params.table[offset + lo], layout.$.params.table[offset + hi], fract(position));
}
@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(layout.$.source);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let at = vec2i(gid.xy); let src = textureLoad(layout.$.source, at, 0);
  let rgb = src.rgb / max(src.a, 1.0 / 255.0); let hsl = toHsl(rgb);
  let byHue = row(0u, hsl.x); let byLuma = row(256u, hsl.z); let bySat = row(256u, hsl.y);
  let corrected = fromHsl(vec3f(fract(hsl.x + byHue.x - 0.5),
    clamp(hsl.y * 2.0 * byHue.y * 2.0 * byLuma.x * 2.0 * bySat.y, 0.0, 1.0),
    clamp(hsl.z + (byHue.z - 0.5) * hsl.y, 0.0, 1.0)));
  textureStore(layout.$.outputTexture, at, vec4f(clamp(corrected, vec3f(0), vec3f(1)) * src.a, src.a));
}`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),ce=`
// ---- Typed-color helpers (premul-invariant) -------------------------------
// Distinct structs; WGSL nominal typing prevents Premul/Straight from being
// swapped, and neither has a .rgb field so channel access is forced through
// unpremul()/premul().
struct Premul { v: vec4f }
struct Straight { v: vec4f }

fn samplePremul(t: texture_2d<f32>, s: sampler, uv: vec2f) -> Premul {
  return Premul(textureSample(t, s, uv));
}

fn sampleStraight(t: texture_2d<f32>, s: sampler, uv: vec2f) -> Straight {
  return Straight(textureSample(t, s, uv));
}

// 1/255 floor avoids dividing by zero on transparent pixels; the resulting
// "straight" color of a fully-transparent pixel is undefined anyway because
// rgb*0 = 0 erases all information, but the floor keeps math finite and
// matches the convention used elsewhere in the pool.
fn unpremul(p: Premul) -> Straight {
  let a = max(p.v.a, 1.0 / 255.0);
  return Straight(vec4f(p.v.rgb / a, p.v.a));
}

fn premul(s: Straight) -> Premul {
  return Premul(vec4f(s.v.rgb * s.v.a, s.v.a));
}

// Linear-op helpers — safe to apply directly to premul values without an
// unpremul round-trip. Use these when you want the intent ("this is a
// premul-safe linear op") to be visible at the call site.
fn premulScale(p: Premul, k: f32) -> Premul {
  return Premul(p.v * k);
}

fn premulAdd(a: Premul, b: Premul) -> Premul {
  return Premul(a.v + b.v);
}

// Premultiplied Porter-Duff "over": src over dst, correct on premul inputs.
fn premulOver(src: Premul, dst: Premul) -> Premul {
  return Premul(src.v + dst.v * (1.0 - src.v.a));
}
`,pe=i({tint:p}),ya=t.bindGroupLayout({params:{uniform:pe},source:{texture:"float"},samp:{sampler:"filtering"}}),wa=s({precision:{source:"working",output:"working"},id:"_canary.passthrough",version:1,surface:"internal",category:"_canary",linearity:"linear-in-rgb",kind:"fragment",params:pe,paramDefaults:{tint:p(1,1,1,1)},paramUi:{tint:{label:"Tint",notes:"RGBA multiplier; white = identity copy"}},layout:ya,samplers:{samp:{magFilter:"nearest",minFilter:"nearest",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"}},wgsl:`
${ce}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = samplePremul(layout.$.source, layout.$.samp, uv);
  // Tint is a per-channel multiplier applied in premul space — a linear op,
  // so the typed Premul value passes through without an unpremul round-trip.
  let tinted = Premul(src.v * layout.$.params.tint);
  return tinted.v;
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),W=`
fn rgb2hsv(rgb: vec3f) -> vec3f {
  let maxC = max(max(rgb.r, rgb.g), rgb.b);
  let minC = min(min(rgb.r, rgb.g), rgb.b);
  let delta = maxC - minC;
  var h: f32 = 0.0;
  var s: f32 = 0.0;
  let v: f32 = maxC;
  if (delta > 0.00001) {
    s = delta / maxC;
    if (maxC == rgb.r) {
      h = (rgb.g - rgb.b) / delta;
      if (rgb.g < rgb.b) { h = h + 6.0; }
    } else if (maxC == rgb.g) {
      h = 2.0 + (rgb.b - rgb.r) / delta;
    } else {
      h = 4.0 + (rgb.r - rgb.g) / delta;
    }
    h = h / 6.0;
  }
  return vec3f(h, s, v);
}

fn hsv2rgb(hsv: vec3f) -> vec3f {
  let h = hsv.x * 6.0;
  let s = hsv.y;
  let v = hsv.z;
  let i = floor(h);
  let f = h - i;
  let p = v * (1.0 - s);
  let q = v * (1.0 - s * f);
  let t = v * (1.0 - s * (1.0 - f));
  let idx = i32(i) % 6;
  if (idx == 0) { return vec3f(v, t, p); }
  if (idx == 1) { return vec3f(q, v, p); }
  if (idx == 2) { return vec3f(p, v, t); }
  if (idx == 3) { return vec3f(p, q, v); }
  if (idx == 4) { return vec3f(t, p, v); }
  return vec3f(v, p, q);
}
`,me=i({brightness:e,contrast:e,saturation:e,hue:e,temperature:e,tint:e,shadows:e,highlights:e}),ka=t.bindGroupLayout({source:{texture:"float"},outputTexture:{storageTexture:"rgba8unorm"},params:{uniform:me}}),$a=s({precision:{source:"working",output:"working"},id:"color.grade",version:1,surface:"published",category:"color",linearity:"nonlinear-in-rgb",kind:"compute",params:me,paramDefaults:{brightness:0,contrast:1,saturation:1,hue:0,temperature:0,tint:0,shadows:0,highlights:0},paramUi:{brightness:{min:-1,max:1,step:.01,label:"Brightness"},contrast:{min:0,max:4,step:.01,label:"Contrast"},saturation:{min:0,max:4,step:.01,label:"Saturation"},hue:{min:-180,max:180,step:1,label:"Hue",notes:"degrees"},temperature:{min:-1,max:1,step:.01,label:"Temperature"},tint:{min:-1,max:1,step:.01,label:"Tint"},shadows:{min:-1,max:1,step:.01,label:"Shadows"},highlights:{min:-1,max:1,step:.01,label:"Highlights"}},layout:ka,workgroupSize:[16,16,1],wgsl:`
${W}
fn smoothstepCustom(e0: f32, e1: f32, x: f32) -> f32 {
  let t = clamp((x - e0) / (e1 - e0), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(layout.$.source);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let coords = vec2<i32>(i32(gid.x), i32(gid.y));
  let effects = layout.$.params;
  var color = textureLoad(layout.$.source, coords, 0);
  // Input is premultiplied (rgb = a*C); the additive brightness / tint /
  // shadows-highlights stages assume straight color. Un-premultiply first,
  // run the full effect chain on straight RGB, then re-premultiply on store.
  let safeA = max(color.a, 1.0 / 255.0);
  var rgb = color.rgb / safeA;

  if (abs(effects.brightness) > 0.001) {
    rgb = clamp(rgb + vec3<f32>(effects.brightness), vec3<f32>(0.0), vec3<f32>(1.0));
  }
  if (abs(effects.contrast - 1.0) > 0.001) {
    rgb = clamp((rgb - 0.5) * effects.contrast + 0.5, vec3<f32>(0.0), vec3<f32>(1.0));
  }
  if (abs(effects.saturation - 1.0) > 0.001) {
    let lum = dot(rgb, vec3<f32>(0.299, 0.587, 0.114));
    rgb = clamp(mix(vec3<f32>(lum), rgb, effects.saturation), vec3<f32>(0.0), vec3<f32>(1.0));
  }
  if (abs(effects.hue) > 0.001) {
    var hsv = rgb2hsv(rgb);
    hsv.x = fract(hsv.x + effects.hue / 360.0);
    rgb = hsv2rgb(hsv);
  }
  if (abs(effects.temperature) > 0.001) {
    if (effects.temperature > 0.0) {
      rgb.r = min(1.0, rgb.r + effects.temperature * 0.2);
      rgb.g = min(1.0, rgb.g + effects.temperature * 0.1);
      rgb.b = max(0.0, rgb.b - effects.temperature * 0.2);
    } else {
      rgb.r = max(0.0, rgb.r + effects.temperature * 0.2);
      rgb.g = max(0.0, rgb.g + effects.temperature * 0.05);
      rgb.b = min(1.0, rgb.b - effects.temperature * 0.2);
    }
  }
  if (abs(effects.tint) > 0.001) {
    rgb.r = clamp(rgb.r + effects.tint * 0.1, 0.0, 1.0);
    rgb.g = clamp(rgb.g - effects.tint * 0.2, 0.0, 1.0);
    rgb.b = clamp(rgb.b + effects.tint * 0.1, 0.0, 1.0);
  }
  if (abs(effects.shadows) > 0.001 || abs(effects.highlights) > 0.001) {
    let lum = dot(rgb, vec3<f32>(0.299, 0.587, 0.114));
    let shadowW = 1.0 - smoothstepCustom(0.0, 0.33, lum);
    let highlightW = smoothstepCustom(0.66, 1.0, lum);
    let adj = effects.shadows * shadowW * 0.3 + effects.highlights * highlightW * 0.3;
    rgb = clamp(rgb + vec3<f32>(adj), vec3<f32>(0.0), vec3<f32>(1.0));
  }

  textureStore(layout.$.outputTexture, coords, vec4<f32>(rgb * color.a, color.a));
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),de=i({amount:e}),Sa=t.bindGroupLayout({params:{uniform:de},source:{texture:"float"},mask:{texture:"float"},samp:{sampler:"filtering"}}),_a={magFilter:"linear",minFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"},Ma=s({precision:{source:"working",mask:"fixed",output:"working"},id:"color.invert",version:1,surface:"published",category:"color",linearity:"nonlinear-in-rgb",kind:"fragment",params:de,paramDefaults:{amount:1},paramUi:{amount:{min:0,max:1,step:.01,label:"Amount"}},layout:Sa,samplers:{samp:_a},wgsl:`
${ce}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  // Input is premultiplied. The typed helpers force us through unpremul()
  // before touching channels — the prior hand-rolled "safeA = max(a, 1/255);
  // straight = rgb/safeA; invert; re-premultiply" dance is now expressed as
  // unpremul/premul calls that can't be skipped accidentally.
  let p = samplePremul(layout.$.source, layout.$.samp, uv);
  let s = unpremul(p);
  let inverted = Straight(vec4f(vec3f(1.0) - s.v.rgb, s.v.a));
  let invPremul = premul(inverted);
  let coverage = textureSample(layout.$.mask, layout.$.samp, uv).a;
  // Linear mix between two premul values is itself a premul-safe linear op,
  // so it's correct to lerp src.v ↔ invPremul.v directly.
  return mix(p.v, invPremul.v, coverage * layout.$.params.amount);
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]},mask:{colorSpace:"data",alpha:"premultiplied",bindingKinds:["texture_2d"],optional:!0}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),fe=i({brightness:e,contrast:e}),Aa=t.bindGroupLayout({params:{uniform:fe},source:{texture:"float"},mask:{texture:"float"},samp:{sampler:"filtering"}}),Ga={magFilter:"linear",minFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"},Pa=s({precision:{source:"working",mask:"fixed",output:"working"},id:"color.brightnessContrast",version:1,surface:"published",category:"color",linearity:"nonlinear-in-rgb",kind:"fragment",params:fe,paramDefaults:{brightness:0,contrast:1},paramUi:{brightness:{min:-1,max:1,step:.01,label:"Brightness"},contrast:{min:0,max:4,step:.01,label:"Contrast"}},layout:Aa,samplers:{samp:Ga},wgsl:`
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  let coverage = textureSample(layout.$.mask, layout.$.samp, uv).a;
  let p = layout.$.params;
  // Brightness/contrast is a straight-color formula; un-premultiply first so
  // the operation acts on the underlying color, then re-premultiply on store.
  // Applying the formula to premultiplied RGB silently scales each adjustment
  // by a and breaks the rgb <= a invariant for transparent regions.
  let safeA = max(src.a, 1.0 / 255.0);
  let straight = src.rgb / safeA;
  let adjusted = clamp((straight - vec3f(0.5)) * p.contrast + vec3f(0.5) + vec3f(p.brightness), vec3f(0.0), vec3f(1.0));
  let mixedStraight = mix(straight, adjusted, coverage);
  return vec4f(mixedStraight * src.a, src.a);
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]},mask:{colorSpace:"data",alpha:"premultiplied",bindingKinds:["texture_2d"],optional:!0}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),ge=i({hue:e,saturation:e,brightness:e}),Ua=t.bindGroupLayout({params:{uniform:ge},source:{texture:"float"},mask:{texture:"float"},samp:{sampler:"filtering"}}),Da={magFilter:"linear",minFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"},La=s({precision:{source:"working",mask:"fixed",output:"working"},id:"color.hsb",version:1,surface:"published",category:"color",linearity:"nonlinear-in-rgb",kind:"fragment",params:ge,paramDefaults:{hue:0,saturation:1,brightness:1},paramUi:{hue:{min:-180,max:180,step:1,label:"Hue",notes:"degrees"},saturation:{min:0,max:4,step:.01,label:"Saturation"},brightness:{min:0,max:4,step:.01,label:"Brightness"}},layout:Ua,samplers:{samp:Da},wgsl:`
${W}
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  let coverage = textureSample(layout.$.mask, layout.$.samp, uv).a;
  let p = layout.$.params;
  // Operate on the straight color: rgb2hsv's V channel is max(r,g,b), so a
  // premultiplied input reports a*V_true and the saturation/brightness
  // multipliers act against the wrong magnitude. Re-premultiply on store so
  // the output stays valid premul.
  let safeA = max(src.a, 1.0 / 255.0);
  let straight = src.rgb / safeA;
  var hsv = rgb2hsv(clamp(straight, vec3f(0.0), vec3f(1.0)));
  hsv.x = fract(hsv.x + p.hue / 360.0);
  hsv.y = clamp(hsv.y * p.saturation, 0.0, 1.0);
  hsv.z = clamp(hsv.z * p.brightness, 0.0, 1.0);
  let processed = clamp(hsv2rgb(hsv), vec3f(0.0), vec3f(1.0));
  let mixedStraight = mix(straight, processed, coverage);
  return vec4f(mixedStraight * src.a, src.a);
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]},mask:{colorSpace:"data",alpha:"premultiplied",bindingKinds:["texture_2d"],optional:!0}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),ve=i({stops:e}),za=t.bindGroupLayout({params:{uniform:ve},source:{texture:"float"},mask:{texture:"float"},samp:{sampler:"filtering"}}),Ra={magFilter:"linear",minFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"},Ta=s({precision:{source:"working",mask:"fixed",output:"working"},id:"color.exposure",version:1,surface:"internal",category:"color",linearity:"linear-in-rgb",kind:"fragment",params:ve,paramDefaults:{stops:0},paramUi:{stops:{min:-4,max:4,step:.1,label:"Exposure",notes:"stops (2^x)"}},layout:za,samplers:{samp:Ra},wgsl:`
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  let coverage = textureSample(layout.$.mask, layout.$.samp, uv).a;
  let gain = pow(2.0, layout.$.params.stops);
  // SDR clamp on the *straight* colour means clamping at alpha in premul
  // space: straight C clamps at 1.0 ⇒ premul a*C clamps at a. Clamping at a
  // literal 1.0 here let partial-alpha pixels escape with rgb > a (a 2×
  // over-bright fringe once composited).
  let processed = clamp(src.rgb * gain, vec3f(0.0), vec3f(src.a));
  let mixed = mix(src.rgb, processed, coverage);
  return vec4f(mixed, src.a);
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]},mask:{colorSpace:"data",alpha:"premultiplied",bindingKinds:["texture_2d"],optional:!0}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),he=i({levels:e}),Ca=t.bindGroupLayout({params:{uniform:he},source:{texture:"float"},mask:{texture:"float"},samp:{sampler:"filtering"}}),Va={magFilter:"linear",minFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"},Y=`
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  let coverage = textureSample(layout.$.mask, layout.$.samp, uv).a;
  let n = max(2.0, min(256.0, layout.$.params.levels));
  // Quantize the underlying straight color, not the premultiplied RGB; on
  // partial-alpha pixels the premultiplied form has rgb <= a, so quantizing
  // before un-premultiplying snaps to the wrong bin and can push rgb > a.
  let safeA = max(src.a, 1.0 / 255.0);
  let straight = src.rgb / safeA;
  let quantized = floor(clamp(straight, vec3f(0.0), vec3f(1.0)) * n) / (n - 1.0);
  let mixedStraight = mix(straight, clamp(quantized, vec3f(0.0), vec3f(1.0)), coverage);
  return vec4f(mixedStraight * src.a, src.a);
}
`,Ba=s({precision:{source:"working",mask:"fixed",output:"working"},id:"color.posterize",version:1,surface:"internal",category:"color",linearity:"nonlinear-in-rgb",kind:"fragment",params:he,paramDefaults:{levels:4},paramUi:{levels:{min:2,max:256,step:1,label:"Levels"}},layout:Ca,samplers:{samp:Va},wgsl:Y,workingWgsl:Y.replace("let quantized = floor(clamp(straight, vec3f(0.0), vec3f(1.0)) * n) / (n - 1.0);",`let alphaCode = max(1.0, round(src.a * 255.0));
  let codes = round(clamp(src.rgb, vec3f(0.0), vec3f(safeA)) * 255.0);
  let scaled = codes * n;
  var bins = floor(scaled / alphaCode);
  bins += select(vec3f(0.0), vec3f(1.0), scaled >= (bins + vec3f(1.0)) * alphaCode);
  bins -= select(vec3f(0.0), vec3f(1.0), scaled < bins * alphaCode);
  let quantized = bins / (n - 1.0);`),io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]},mask:{colorSpace:"data",alpha:"premultiplied",bindingKinds:["texture_2d"],optional:!0}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),be=i({size:e,intensity:e,domainMin:p,domainMax:p}),Fa=t.bindGroupLayout({params:{uniform:be},source:{texture:"float"},lut:{texture:"float"},mask:{texture:"float"},samp:{sampler:"filtering"}}),Ka=s({precision:{source:"working",lut:"fixed",mask:"fixed",output:"working"},id:"color.cubeLut",version:1,surface:"internal",category:"color",linearity:"nonlinear-in-rgb",kind:"fragment",params:be,paramDefaults:{size:2,intensity:1,domainMin:p(0,0,0,0),domainMax:p(1,1,1,0)},layout:Fa,samplers:{samp:{magFilter:"linear",minFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"}},wgsl:`
fn lookup(r: i32, g: i32, b: i32, size: i32) -> vec3f {
  return textureLoad(layout.$.lut, vec2i(b * size + r, g), 0).rgb;
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = layout.$.params;
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  let coverage = textureSample(layout.$.mask, layout.$.samp, uv).a;
  let size = i32(round(p.size));
  let straight = src.rgb / max(src.a, 1.0 / 255.0);
  let domain = max(p.domainMax.xyz - p.domainMin.xyz, vec3f(0.000001));
  let coordinate = clamp((straight - p.domainMin.xyz) / domain, vec3f(0.0), vec3f(1.0)) * f32(size - 1);
  let lo = vec3i(floor(coordinate));
  let hi = min(lo + vec3i(1), vec3i(size - 1));
  let f = fract(coordinate);
  var graded = vec3f(0.0);
  for (var bz = 0; bz <= 1; bz = bz + 1) {
    for (var gy = 0; gy <= 1; gy = gy + 1) {
      for (var rx = 0; rx <= 1; rx = rx + 1) {
        let r = select(lo.x, hi.x, rx == 1);
        let g = select(lo.y, hi.y, gy == 1);
        let b = select(lo.z, hi.z, bz == 1);
        let weight = select(1.0 - f.x, f.x, rx == 1)
          * select(1.0 - f.y, f.y, gy == 1)
          * select(1.0 - f.z, f.z, bz == 1);
        graded = graded + lookup(r, g, b, size) * weight;
      }
    }
  }
  let mixAmount = clamp(p.intensity * coverage, 0.0, 1.0);
  return vec4f(clamp(mix(straight, graded, mixAmount), vec3f(0.0), vec3f(1.0)) * src.a, src.a);
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]},lut:{colorSpace:"data",alpha:"premultiplied",bindingKinds:["texture_2d"]},mask:{colorSpace:"data",alpha:"premultiplied",bindingKinds:["texture_2d"],optional:!0}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),xe=i({mode:e}),Ea=t.bindGroupLayout({params:{uniform:xe},source:{texture:"float"},samp:{sampler:"filtering"}}),Oa={magFilter:"linear",minFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"},Ia=s({precision:{source:"working",output:"working"},id:"color.channelSplit",version:1,surface:"internal",category:"color",linearity:"nonlinear-in-rgb",kind:"fragment",params:xe,paramDefaults:{mode:0},paramUi:{mode:{min:0,max:4,step:1,label:"Channel",notes:"0 R / 1 G / 2 B / 3 A / 4 luma"}},layout:Ea,samplers:{samp:Oa},wgsl:`
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  // Un-premultiply so the reported channel/luma reflects the underlying
  // straight colour. Reading premultiplied rgb directly under-reports every
  // channel on partial-alpha pixels (e.g. a 50%-transparent mid-grey reads at
  // half its true value).
  let straight = src.rgb / max(src.a, 1.0 / 255.0);
  let mode = i32(round(layout.$.params.mode));
  var v: f32 = 0.0;
  if (mode == 0) {
    v = straight.r;
  } else if (mode == 1) {
    v = straight.g;
  } else if (mode == 2) {
    v = straight.b;
  } else if (mode == 3) {
    v = src.a;
  } else {
    v = dot(straight, vec3f(0.299, 0.587, 0.114));
  }
  return vec4f(v, v, v, 1.0);
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),ye=i({rFrom:e,gFrom:e,bFrom:e,aFrom:e}),Wa=t.bindGroupLayout({params:{uniform:ye},source:{texture:"float"},samp:{sampler:"filtering"}}),ja={magFilter:"linear",minFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"},Ha=s({precision:{source:"working",output:"working"},id:"color.channelShuffle",version:1,surface:"internal",category:"color",linearity:"nonlinear-in-rgb",kind:"fragment",params:ye,paramDefaults:{rFrom:0,gFrom:1,bFrom:2,aFrom:3},paramUi:{rFrom:{min:0,max:3,step:1,label:"R ← channel",notes:"0 R / 1 G / 2 B / 3 A"},gFrom:{min:0,max:3,step:1,label:"G ← channel",notes:"0 R / 1 G / 2 B / 3 A"},bFrom:{min:0,max:3,step:1,label:"B ← channel",notes:"0 R / 1 G / 2 B / 3 A"},aFrom:{min:0,max:3,step:1,label:"A ← channel",notes:"0 R / 1 G / 2 B / 3 A"}},layout:Wa,samplers:{samp:ja},wgsl:`
fn pick(src: vec4f, idx: i32) -> f32 {
  if (idx == 0) { return src.r; }
  if (idx == 1) { return src.g; }
  if (idx == 2) { return src.b; }
  return src.a;
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  let p = layout.$.params;
  // Un-premultiply by the source alpha so channels are picked in straight
  // space, then re-premultiply by the chosen output alpha — keeps the pool's
  // premultiplied-between-modules invariant regardless of aFrom.
  let safeA = max(src.a, 0.0001);
  let straight = vec4f(src.rgb / safeA, src.a);
  let outA = pick(straight, i32(round(p.aFrom)) & 3);
  let outR = pick(straight, i32(round(p.rFrom)) & 3) * outA;
  let outG = pick(straight, i32(round(p.gFrom)) & 3) * outA;
  let outB = pick(straight, i32(round(p.bFrom)) & 3) * outA;
  return vec4f(outR, outG, outB, outA);
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),we=i({alphaChannel:e}),qa=t.bindGroupLayout({params:{uniform:we},source:{texture:"float"},alpha:{texture:"float"},samp:{sampler:"filtering"}}),Na={magFilter:"linear",minFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"},Ya=s({precision:{source:"working",alpha:"fixed",output:"working"},id:"color.channelMerge",version:1,surface:"internal",category:"color",linearity:"nonlinear-in-rgb",kind:"fragment",params:we,paramDefaults:{alphaChannel:3},paramUi:{alphaChannel:{min:0,max:4,step:1,label:"Alpha source",notes:"0 R / 1 G / 2 B / 3 A / 4 luma"}},layout:qa,samplers:{samp:Na},wgsl:`
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  let alphaSrc = textureSample(layout.$.alpha, layout.$.samp, uv);
  let mode = i32(round(layout.$.params.alphaChannel));
  var newA: f32 = 0.0;
  if (mode == 0) {
    newA = alphaSrc.r;
  } else if (mode == 1) {
    newA = alphaSrc.g;
  } else if (mode == 2) {
    newA = alphaSrc.b;
  } else if (mode == 3) {
    newA = alphaSrc.a;
  } else {
    newA = dot(alphaSrc.rgb, vec3f(0.299, 0.587, 0.114));
  }
  newA = clamp(newA, 0.0, 1.0);
  // Un-premultiply source RGB by its own alpha, then re-premultiply with the
  // new alpha so downstream consumers see canonical premultiplied output.
  let safeA = max(src.a, 0.0001);
  let straightRgb = src.rgb / safeA;
  return vec4f(straightRgb * newA, newA);
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]},alpha:{colorSpace:"data",alpha:"premultiplied",bindingKinds:["texture_2d"]}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),z=`
fn luma709(c: vec3f) -> f32 {
  return dot(c, vec3f(0.2126, 0.7152, 0.0722));
}
`,ke=i({amount:e}),Xa=t.bindGroupLayout({params:{uniform:ke},source:{texture:"float"},mask:{texture:"float"},samp:{sampler:"filtering"}}),Za={magFilter:"linear",minFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"},Ja=s({precision:{source:"working",mask:"fixed",output:"working"},id:"color.grayscale",version:1,surface:"internal",category:"color",linearity:"linear-in-rgb",kind:"fragment",params:ke,paramDefaults:{amount:1},paramUi:{amount:{min:0,max:1,step:.01,label:"Amount"}},layout:Xa,samplers:{samp:Za},wgsl:`
${z}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  let coverage = textureSample(layout.$.mask, layout.$.samp, uv).a;
  let luma = luma709(src.rgb);
  let gray = vec3f(luma);
  let mixed = mix(src.rgb, gray, coverage * layout.$.params.amount);
  return vec4f(mixed, src.a);
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]},mask:{colorSpace:"data",alpha:"premultiplied",bindingKinds:["texture_2d"],optional:!0}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),$e=i({threshold:e}),Qa=t.bindGroupLayout({params:{uniform:$e},source:{texture:"float"},mask:{texture:"float"},samp:{sampler:"filtering"}}),et={magFilter:"linear",minFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"},rt=s({precision:{source:"working",mask:"fixed",output:"working"},id:"color.solarize",version:1,surface:"internal",category:"color",linearity:"nonlinear-in-rgb",kind:"fragment",params:$e,paramDefaults:{threshold:.5},paramUi:{threshold:{min:0,max:1,step:.01,label:"Threshold"}},layout:Qa,samplers:{samp:et},wgsl:`
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  let coverage = textureSample(layout.$.mask, layout.$.samp, uv).a;
  let t = layout.$.params.threshold;
  // Threshold the underlying straight color so the comparison against t is
  // alpha-independent; otherwise transparent pixels (premultiplied near 0)
  // are below threshold even when their underlying color is bright.
  let safeA = max(src.a, 1.0 / 255.0);
  let straight = src.rgb / safeA;
  let inverted = vec3f(
    select(straight.r, 1.0 - straight.r, straight.r > t),
    select(straight.g, 1.0 - straight.g, straight.g > t),
    select(straight.b, 1.0 - straight.b, straight.b > t)
  );
  let mixedStraight = mix(straight, inverted, coverage);
  return vec4f(mixedStraight * src.a, src.a);
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]},mask:{colorSpace:"data",alpha:"premultiplied",bindingKinds:["texture_2d"],optional:!0}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),Se=i({temperature:e,tint:e}),at=t.bindGroupLayout({params:{uniform:Se},source:{texture:"float"},mask:{texture:"float"},samp:{sampler:"filtering"}}),tt={magFilter:"linear",minFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"},ot=s({precision:{source:"working",mask:"fixed",output:"working"},id:"color.colorBalance",version:1,surface:"internal",category:"color",linearity:"nonlinear-in-rgb",kind:"fragment",params:Se,paramDefaults:{temperature:0,tint:0},paramUi:{temperature:{min:-1,max:1,step:.01,label:"Temperature"},tint:{min:-1,max:1,step:.01,label:"Tint"}},layout:at,samplers:{samp:tt},wgsl:`
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  let coverage = textureSample(layout.$.mask, layout.$.samp, uv).a;
  let p = layout.$.params;
  // Operate on straight color so the additive shifts act on the underlying
  // colour, not the premultiplied magnitude. Re-premultiply on store.
  let safeA = max(src.a, 1.0 / 255.0);
  let straight = src.rgb / safeA;
  let tempShift = p.temperature * 0.3;
  let tintShift = p.tint * 0.3;
  var rgb = straight;
  rgb.r = rgb.r + tempShift + tintShift * 0.5;
  rgb.g = rgb.g - tintShift;
  rgb.b = rgb.b - tempShift + tintShift * 0.5;
  let mixed = mix(straight, rgb, coverage);
  return vec4f(clamp(mixed, vec3f(0.0), vec3f(1.0)) * src.a, src.a);
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]},mask:{colorSpace:"data",alpha:"premultiplied",bindingKinds:["texture_2d"],optional:!0}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),_e=i({exposure:e,rolloff:e,whites:e,blacks:e}),it=t.bindGroupLayout({source:{texture:"float"},outputTexture:{storageTexture:"rgba8unorm"},params:{uniform:_e}}),st=s({precision:{source:"working",output:"working"},id:"color.exposureLinear",version:1,surface:"internal",category:"color",linearity:"nonlinear-in-rgb",kind:"compute",params:_e,paramDefaults:{exposure:0,rolloff:0,whites:0,blacks:0},paramUi:{exposure:{min:-5,max:5,step:.1,label:"Exposure",notes:"Linear-light stops"},rolloff:{min:0,max:1,step:.01,label:"Highlight roll-off"},whites:{min:-2,max:2,step:.1,label:"Whites",notes:"Stops, weighted toward source highlights"},blacks:{min:-1,max:1,step:.01,label:"Blacks",notes:"Encoded offset weighted toward shadows"}},layout:it,workgroupSize:[16,16,1],wgsl:`
${jr}@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(layout.$.source);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let at = vec2i(gid.xy); let src = textureLoad(layout.$.source, at, 0);
  let p = layout.$.params;
  let linear = decode(${Yr});
  let mask = smoothstep(0.25, 1.0, dot(linear, vec3f(0.2126, 0.7152, 0.0722)));
  var gain = exp2(clamp(p.exposure, -5.0, 5.0)) * mix(1.0, exp2(clamp(p.whites, -2.0, 2.0)), mask);
  let strength = clamp(p.rolloff, 0.0, 1.0); let knee = 1.0 - 0.75 * strength;
  let peak = max(max(linear.r, linear.g), linear.b) * gain;
  if (strength > 0.0 && peak > knee) {
    gain *= (knee + (1.0 - knee) * (1.0 - exp(-(peak - knee) / (1.0 - knee)))) / peak;
  }
  let encoded = encode(linear * gain);
  let shade = vec3f(1) - clamp(encoded, vec3f(0), vec3f(1));
  let lifted = encoded + clamp(p.blacks, -1.0, 1.0) * 0.15 * shade * shade * shade;
  textureStore(layout.$.outputTexture, at, vec4f(clamp(lifted, vec3f(0), vec3f(1)) * src.a, src.a));
}`,io:{inputs:{source:{colorSpace:"srgb",alpha:"premultiplied",bindingKinds:["texture_2d"]}},output:{colorSpace:"srgb",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),Me=i({exposure:e,contrast:e,highlights:e,shadows:e,whites:e,blacks:e}),lt=t.bindGroupLayout({params:{uniform:Me},source:{texture:"float"},mask:{texture:"float"},samp:{sampler:"filtering"}}),nt={magFilter:"linear",minFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"},ut=s({precision:{source:"working",mask:"fixed",output:"working"},id:"color.exposureTone",version:1,surface:"internal",category:"color",linearity:"nonlinear-in-rgb",kind:"fragment",params:Me,paramDefaults:{exposure:0,contrast:0,highlights:0,shadows:0,whites:0,blacks:0},paramUi:{exposure:{min:-5,max:5,step:.1,label:"Exposure",notes:"stops (2^x)"},contrast:{min:-1,max:1,step:.01,label:"Contrast"},highlights:{min:-1,max:1,step:.01,label:"Highlights"},shadows:{min:-1,max:1,step:.01,label:"Shadows"},whites:{min:-1,max:1,step:.01,label:"Whites"},blacks:{min:-1,max:1,step:.01,label:"Blacks"}},layout:lt,samplers:{samp:nt},wgsl:`
${z}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  let coverage = textureSample(layout.$.mask, layout.$.samp, uv).a;
  let p = layout.$.params;
  let safeA = max(src.a, 1.0 / 255.0);
  let straight = src.rgb / safeA;
  let expMul = pow(2.0, p.exposure);
  var rgb = straight * expMul;
  let lum = luma709(rgb);
  let hlMask = clamp((lum - 0.5) * 2.0, 0.0, 1.0);
  let shMask = clamp((0.5 - lum) * 2.0, 0.0, 1.0);
  rgb = rgb - vec3f(hlMask * p.highlights * 0.5) + vec3f(shMask * p.shadows * 0.5);
  rgb = rgb + p.whites * 0.2 * rgb;
  rgb = rgb + p.blacks * 0.2 * (vec3f(1.0) - rgb);
  rgb = vec3f(0.5) + (rgb - vec3f(0.5)) * (1.0 + p.contrast);
  let mixed = mix(straight, rgb, coverage);
  return vec4f(clamp(mixed, vec3f(0.0), vec3f(1.0)) * src.a, src.a);
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]},mask:{colorSpace:"data",alpha:"premultiplied",bindingKinds:["texture_2d"],optional:!0}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),Ae=i({liftR:e,liftG:e,liftB:e,liftMaster:e,gammaR:e,gammaG:e,gammaB:e,gammaMaster:e,gainR:e,gainG:e,gainB:e,gainMaster:e}),ct=t.bindGroupLayout({params:{uniform:Ae},source:{texture:"float"},mask:{texture:"float"},samp:{sampler:"filtering"}}),pt={magFilter:"linear",minFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"},mt=s({precision:{source:"working",mask:"fixed",output:"working"},id:"color.liftGammaGain",version:1,surface:"internal",category:"color",linearity:"nonlinear-in-rgb",kind:"fragment",params:Ae,paramDefaults:{liftR:0,liftG:0,liftB:0,liftMaster:0,gammaR:1,gammaG:1,gammaB:1,gammaMaster:1,gainR:1,gainG:1,gainB:1,gainMaster:1},layout:ct,samplers:{samp:pt},wgsl:`
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  let coverage = textureSample(layout.$.mask, layout.$.samp, uv).a;
  let p = layout.$.params;
  let safeA = max(src.a, 1.0 / 255.0);
  let straight = src.rgb / safeA;
  let lift = vec3f(p.liftR + p.liftMaster, p.liftG + p.liftMaster, p.liftB + p.liftMaster);
  let gain = vec3f(p.gainR * p.gainMaster, p.gainG * p.gainMaster, p.gainB * p.gainMaster);
  let r = (straight + lift) * gain;
  let gammaInv = vec3f(
    1.0 / max(0.01, p.gammaR * p.gammaMaster),
    1.0 / max(0.01, p.gammaG * p.gammaMaster),
    1.0 / max(0.01, p.gammaB * p.gammaMaster)
  );
  // pow(negative, x) is undefined; the CPU path returns 0 for r <= 0, so
  // guard with max() and select the 0 branch to match exactly.
  var rgb = vec3f(
    select(0.0, pow(max(r.r, 0.0), gammaInv.r), r.r > 0.0),
    select(0.0, pow(max(r.g, 0.0), gammaInv.g), r.g > 0.0),
    select(0.0, pow(max(r.b, 0.0), gammaInv.b), r.b > 0.0)
  );
  let mixed = mix(straight, rgb, coverage);
  return vec4f(clamp(mixed, vec3f(0.0), vec3f(1.0)) * src.a, src.a);
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]},mask:{colorSpace:"data",alpha:"premultiplied",bindingKinds:["texture_2d"],optional:!0}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),Ge=i({slopeR:e,slopeG:e,slopeB:e,offsetR:e,offsetG:e,offsetB:e,powerR:e,powerG:e,powerB:e,saturation:e}),dt=t.bindGroupLayout({params:{uniform:Ge},source:{texture:"float"},mask:{texture:"float"},samp:{sampler:"filtering"}}),ft={magFilter:"linear",minFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"},gt=s({precision:{source:"working",mask:"fixed",output:"working"},id:"color.cdl",version:1,surface:"internal",category:"color",linearity:"nonlinear-in-rgb",kind:"fragment",params:Ge,paramDefaults:{slopeR:1,slopeG:1,slopeB:1,offsetR:0,offsetG:0,offsetB:0,powerR:1,powerG:1,powerB:1,saturation:1},layout:dt,samplers:{samp:ft},wgsl:`
${z}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  let coverage = textureSample(layout.$.mask, layout.$.samp, uv).a;
  let p = layout.$.params;
  let safeA = max(src.a, 1.0 / 255.0);
  let straight = src.rgb / safeA;
  let slope = vec3f(p.slopeR, p.slopeG, p.slopeB);
  let offset = vec3f(p.offsetR, p.offsetG, p.offsetB);
  let power = vec3f(p.powerR, p.powerG, p.powerB);
  // Clamp after slope/offset (matches the CPU loop) so pow() sees [0,1] and
  // never takes a negative base.
  var rgb = clamp(straight * slope + offset, vec3f(0.0), vec3f(1.0));
  rgb = pow(rgb, power);
  let lum = luma709(rgb);
  rgb = vec3f(lum) + (rgb - vec3f(lum)) * p.saturation;
  let mixed = mix(straight, rgb, coverage);
  return vec4f(clamp(mixed, vec3f(0.0), vec3f(1.0)) * src.a, src.a);
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]},mask:{colorSpace:"data",alpha:"premultiplied",bindingKinds:["texture_2d"],optional:!0}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),Pe=i({blackPoint:e,whitePoint:e,shadows:e,midtones:e,highlights:e,redMidtones:e,greenMidtones:e,blueMidtones:e}),vt=t.bindGroupLayout({params:{uniform:Pe},source:{texture:"float"},mask:{texture:"float"},samp:{sampler:"filtering"}}),ht={magFilter:"linear",minFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"},bt=s({precision:{source:"working",mask:"fixed",output:"working"},id:"color.curves",version:1,surface:"internal",category:"color",linearity:"nonlinear-in-rgb",kind:"fragment",params:Pe,paramDefaults:{blackPoint:0,whitePoint:1,shadows:0,midtones:0,highlights:0,redMidtones:0,greenMidtones:0,blueMidtones:0},layout:vt,samplers:{samp:ht},wgsl:`
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  let coverage = textureSample(layout.$.mask, layout.$.samp, uv).a;
  let p = layout.$.params;
  let safeA = max(src.a, 1.0 / 255.0);
  let straight = src.rgb / safeA;
  let range = max(0.001, p.whitePoint - p.blackPoint);
  let gammaAll = 1.0 / max(0.01, 1.0 + p.midtones);
  let gammaPer = vec3f(
    1.0 / max(0.01, 1.0 + p.redMidtones),
    1.0 / max(0.01, 1.0 + p.greenMidtones),
    1.0 / max(0.01, 1.0 + p.blueMidtones)
  );
  var rgb = clamp((straight - vec3f(p.blackPoint)) / range, vec3f(0.0), vec3f(1.0));
  rgb = rgb + p.shadows * (vec3f(1.0) - rgb) * rgb;
  rgb = pow(max(rgb, vec3f(0.0)), vec3f(gammaAll));
  rgb = rgb + p.highlights * rgb * (vec3f(1.0) - rgb);
  rgb = pow(max(rgb, vec3f(0.0)), gammaPer);
  let mixed = mix(straight, rgb, coverage);
  return vec4f(clamp(mixed, vec3f(0.0), vec3f(1.0)) * src.a, src.a);
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]},mask:{colorSpace:"data",alpha:"premultiplied",bindingKinds:["texture_2d"],optional:!0}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),Ue=i({table:K(p,256)}),xt=t.bindGroupLayout({source:{texture:"float"},outputTexture:{storageTexture:"rgba8unorm"},params:{uniform:Ue}}),yt=s({precision:{source:"working",output:"working"},id:"color.curveTransfer",version:1,surface:"internal",category:"color",linearity:"nonlinear-in-rgb",kind:"compute",params:Ue,paramDefaults:{table:Array.from({length:256},(r,a)=>p(a/255,a/255,a/255,1))},layout:xt,workgroupSize:[16,16,1],wgsl:`
fn transfer(value: f32, channel: u32) -> f32 {
  let at = clamp(value, 0.0, 1.0) * 255.0;
  let lo = u32(floor(at)); let hi = min(255u, lo + 1u);
  return mix(layout.$.params.table[lo][channel], layout.$.params.table[hi][channel], fract(at));
}
@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(layout.$.source);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let at = vec2<i32>(gid.xy); let src = textureLoad(layout.$.source, at, 0);
  let rgb = src.rgb / max(src.a, 1.0 / 255.0);
  let mapped = vec3<f32>(transfer(rgb.r, 0u), transfer(rgb.g, 1u), transfer(rgb.b, 2u));
  textureStore(layout.$.outputTexture, at, vec4<f32>(mapped * src.a, src.a));
}`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),De=i({hueShift:e,satAdj:e,lumAdj:e,rangeLo:e,rangeHi:e,useRange:e}),wt=t.bindGroupLayout({params:{uniform:De},source:{texture:"float"},mask:{texture:"float"},samp:{sampler:"filtering"}}),kt={magFilter:"linear",minFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"},$t=s({precision:{source:"working",mask:"fixed",output:"working"},id:"color.hslAdjust",version:1,surface:"internal",category:"color",linearity:"nonlinear-in-rgb",kind:"fragment",params:De,paramDefaults:{hueShift:0,satAdj:0,lumAdj:0,rangeLo:0,rangeHi:1,useRange:0},paramUi:{hueShift:{min:-1,max:1,step:.01,label:"Hue shift"},satAdj:{min:-1,max:1,step:.01,label:"Saturation"},lumAdj:{min:-1,max:1,step:.01,label:"Luminance"},rangeLo:{min:0,max:1,step:.01,label:"Range low"},rangeHi:{min:0,max:1,step:.01,label:"Range high"},useRange:{min:0,max:1,step:1,label:"Use range"}},layout:wt,samplers:{samp:kt},wgsl:`
${W}
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  let coverage = textureSample(layout.$.mask, layout.$.samp, uv).a;
  let p = layout.$.params;
  let safeA = max(src.a, 1.0 / 255.0);
  let straight = clamp(src.rgb / safeA, vec3f(0.0), vec3f(1.0));
  var hsv = rgb2hsv(straight);
  var blend: f32 = 1.0;
  if (p.useRange > 0.5) {
    if (hsv.y < 0.1) {
      blend = 0.0;
    } else {
      let lo = p.rangeLo;
      let hi = p.rangeHi;
      if (lo > hi) {
        // Wrapping window (e.g. reds): in-range when above lo OR below hi.
        if (hsv.x >= lo || hsv.x <= hi) {
          let halfWidth = (1.0 - lo + hi) * 0.5;
          let center = fract(lo + halfWidth);
          var dist = abs(hsv.x - center);
          if (dist > 0.5) { dist = 1.0 - dist; }
          blend = clamp(1.0 - dist / halfWidth, 0.0, 1.0);
        } else {
          blend = 0.0;
        }
      } else {
        let center = (lo + hi) * 0.5;
        let halfWidth = (hi - lo) * 0.5;
        let dist = abs(hsv.x - center);
        blend = clamp(1.0 - dist / halfWidth, 0.0, 1.0);
      }
    }
  }
  if (blend > 0.0) {
    hsv.x = fract(hsv.x + p.hueShift * 0.5 * blend);
    hsv.y = clamp(hsv.y * (1.0 + p.satAdj * blend), 0.0, 1.0);
    hsv.z = clamp(hsv.z * (1.0 + p.lumAdj * blend), 0.0, 1.0);
  }
  let processed = hsv2rgb(hsv);
  let mixed = mix(straight, processed, coverage);
  return vec4f(clamp(mixed, vec3f(0.0), vec3f(1.0)) * src.a, src.a);
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]},mask:{colorSpace:"data",alpha:"premultiplied",bindingKinds:["texture_2d"],optional:!0}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),Le=i({shadowColor:M,shadowSat:e,highlightColor:M,highlightSat:e,balance:e}),St=t.bindGroupLayout({params:{uniform:Le},source:{texture:"float"},mask:{texture:"float"},samp:{sampler:"filtering"}}),_t={magFilter:"linear",minFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"},Mt=s({precision:{source:"working",mask:"fixed",output:"working"},id:"color.splitToning",version:1,surface:"internal",category:"color",linearity:"nonlinear-in-rgb",kind:"fragment",params:Le,paramDefaults:{shadowColor:M(.5,.5,.5),shadowSat:0,highlightColor:M(.5,.5,.5),highlightSat:0,balance:0},layout:St,samplers:{samp:_t},wgsl:`
${z}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  let coverage = textureSample(layout.$.mask, layout.$.samp, uv).a;
  let p = layout.$.params;
  let safeA = max(src.a, 1.0 / 255.0);
  let straight = src.rgb / safeA;
  let lum = luma709(straight);
  let balOff = p.balance * 0.25;
  let shMask = clamp((0.5 + balOff - lum) * 2.0, 0.0, 1.0);
  let hlMask = clamp((lum - 0.5 + balOff) * 2.0, 0.0, 1.0);
  let rgb = straight
    + shMask * (p.shadowColor - vec3f(0.5)) * p.shadowSat
    + hlMask * (p.highlightColor - vec3f(0.5)) * p.highlightSat;
  let mixed = mix(straight, rgb, coverage);
  return vec4f(clamp(mixed, vec3f(0.0), vec3f(1.0)) * src.a, src.a);
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]},mask:{colorSpace:"data",alpha:"premultiplied",bindingKinds:["texture_2d"],optional:!0}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),ze=i({shadow:M,contrast:e,highlight:M,saturation:e,fade:e,intensity:e}),At=t.bindGroupLayout({params:{uniform:ze},source:{texture:"float"},mask:{texture:"float"},samp:{sampler:"filtering"}}),Gt={magFilter:"linear",minFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"},Pt=s({precision:{source:"working",mask:"fixed",output:"working"},id:"color.filmLook",version:1,surface:"internal",category:"color",linearity:"nonlinear-in-rgb",kind:"fragment",params:ze,paramDefaults:{shadow:M(.5,.5,.5),contrast:1,highlight:M(.5,.5,.5),saturation:1,fade:0,intensity:0},layout:At,samplers:{samp:Gt},wgsl:`
${z}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  let coverage = textureSample(layout.$.mask, layout.$.samp, uv).a;
  let p = layout.$.params;
  let safeA = max(src.a, 1.0 / 255.0);
  let straight = src.rgb / safeA;
  var rgb = straight;
  let lum = luma709(rgb);
  let shMask = clamp(1.0 - lum * 2.0, 0.0, 1.0);
  let hlMask = clamp(lum * 2.0 - 1.0, 0.0, 1.0);
  rgb = rgb
    + shMask * (p.shadow - vec3f(0.5)) * 0.3
    + hlMask * (p.highlight - vec3f(0.5)) * 0.3;
  rgb = (rgb - vec3f(0.5)) * p.contrast + vec3f(0.5);
  let lum2 = luma709(rgb);
  rgb = vec3f(lum2) + (rgb - vec3f(lum2)) * p.saturation;
  // fade = 0 leaves rgb unchanged, so the CPU's "if (fade > 0)" guard is moot.
  rgb = rgb * (1.0 - p.fade) + vec3f(p.fade * 0.15);
  rgb = straight + (rgb - straight) * p.intensity;
  let mixed = mix(straight, rgb, coverage);
  return vec4f(clamp(mixed, vec3f(0.0), vec3f(1.0)) * src.a, src.a);
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]},mask:{colorSpace:"data",alpha:"premultiplied",bindingKinds:["texture_2d"],optional:!0}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),Re=i({rBlack:e,rGamma:e,rWhite:e,gBlack:e,gGamma:e,gWhite:e,bBlack:e,bGamma:e,bWhite:e}),Ut=t.bindGroupLayout({params:{uniform:Re},source:{texture:"float"},mask:{texture:"float"},samp:{sampler:"filtering"}}),Dt={magFilter:"linear",minFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"},Lt=s({precision:{source:"working",mask:"fixed",output:"working"},id:"color.levels",version:1,surface:"internal",category:"color",linearity:"nonlinear-in-rgb",kind:"fragment",params:Re,paramDefaults:{rBlack:0,rGamma:1,rWhite:1,gBlack:0,gGamma:1,gWhite:1,bBlack:0,bGamma:1,bWhite:1},paramUi:{rBlack:{min:0,max:1,step:.01,label:"Red black"},rGamma:{min:.01,max:10,step:.01,label:"Red gamma"},rWhite:{min:0,max:1,step:.01,label:"Red white"},gBlack:{min:0,max:1,step:.01,label:"Green black"},gGamma:{min:.01,max:10,step:.01,label:"Green gamma"},gWhite:{min:0,max:1,step:.01,label:"Green white"},bBlack:{min:0,max:1,step:.01,label:"Blue black"},bGamma:{min:.01,max:10,step:.01,label:"Blue gamma"},bWhite:{min:0,max:1,step:.01,label:"Blue white"}},layout:Ut,samplers:{samp:Dt},wgsl:`
fn levelChannel(x: f32, black: f32, gamma: f32, white: f32) -> f32 {
  let denom = max(1.0 / 255.0, white - black);
  let t = clamp((x - black) / denom, 0.0, 1.0);
  return pow(t, 1.0 / max(0.01, gamma));
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  let coverage = textureSample(layout.$.mask, layout.$.samp, uv).a;
  // Operate on straight (un-premultiplied) color so the per-channel remap is
  // correct on partial-alpha pixels, then re-premultiply on output.
  let safeA = max(src.a, 1.0 / 255.0);
  let straight = src.rgb / safeA;
  let p = layout.$.params;
  let leveled = vec3f(
    levelChannel(straight.r, p.rBlack, p.rGamma, p.rWhite),
    levelChannel(straight.g, p.gBlack, p.gGamma, p.gWhite),
    levelChannel(straight.b, p.bBlack, p.bGamma, p.bWhite)
  );
  let mixedStraight = mix(straight, clamp(leveled, vec3f(0.0), vec3f(1.0)), coverage);
  return vec4f(mixedStraight * src.a, src.a);
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]},mask:{colorSpace:"data",alpha:"premultiplied",bindingKinds:["texture_2d"],optional:!0}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),Te=i({radius:e,sigma:e,direction:P}),zt=t.bindGroupLayout({source:{texture:"float"},outputTexture:{storageTexture:"rgba8unorm"},params:{uniform:Te}}),Rt=s({precision:{source:"working-or-mask",output:"working-or-mask"},id:"filters.blur.gaussian",version:1,surface:"published",category:"filters",linearity:"linear-in-rgb",kind:"compute",params:Te,paramDefaults:{radius:0,sigma:0,direction:P(1,0)},paramUi:{radius:{min:0,max:256,step:.5,label:"Radius",notes:"pixels"},sigma:{min:0,max:96,step:.1,label:"Sigma"},direction:{label:"Direction",notes:"(1,0) horizontal, (0,1) vertical"}},layout:zt,workgroupSize:[16,16,1],wgsl:`
@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(layout.$.source);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let coords = vec2<i32>(i32(gid.x), i32(gid.y));
  let blur = layout.$.params;

  if (blur.radius < 0.5) {
    textureStore(layout.$.outputTexture, coords, textureLoad(layout.$.source, coords, 0));
    return;
  }

  // Visit every texel in the supported radius. Spaced taps alias thin lines.
  let kernelRadius = i32(min(blur.radius, 256.0));
  // Honor an explicit positive sigma. Only fall back to radius/3 when the
  // caller leaves sigma unset (<= 0); the previous max(sigma, radius/3)
  // silently raised any explicit sigma smaller than radius/3.
  let sigma = select(blur.sigma, min(blur.radius, 256.0) / 3.0, blur.sigma <= 0.0);

  var colorSum = textureLoad(layout.$.source, coords, 0);
  var weightSum = 1.0;
  // Center-out recurrence avoids one exponential per tap and stays finite
  // for narrow sigmas whose outer weights underflow to zero.
  var weight = 1.0;
  var ratio = exp(-0.5 / (sigma * sigma));
  let ratioStep = ratio * ratio;
  for (var i = 1; i <= kernelRadius; i = i + 1) {
    weight = weight * ratio;
    ratio = ratio * ratioStep;
    let distance = f32(i);
    let offset = vec2<i32>(
      i32(round(blur.direction.x * distance)),
      i32(round(blur.direction.y * distance))
    );
    let hi = vec2<i32>(dims) - vec2<i32>(1);
    let a = clamp(coords + offset, vec2<i32>(0), hi);
    let b = clamp(coords - offset, vec2<i32>(0), hi);
    colorSum = colorSum + (textureLoad(layout.$.source, a, 0) + textureLoad(layout.$.source, b, 0)) * weight;
    weightSum = weightSum + 2.0 * weight;
  }
  textureStore(layout.$.outputTexture, coords, colorSum / weightSum);
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),Ce=i({amount:e,threshold:e}),Tt=t.bindGroupLayout({source:{texture:"float"},outputTexture:{storageTexture:"rgba8unorm"},params:{uniform:Ce}}),Ct=s({precision:{source:"working",output:"working"},id:"filters.sharpen.unsharpMask",version:1,surface:"published",category:"filters",linearity:"nonlinear-in-rgb",kind:"compute",params:Ce,paramDefaults:{amount:0,threshold:0},paramUi:{amount:{min:0,max:2,step:.01,label:"Amount"},threshold:{min:0,max:1,step:.01,label:"Threshold"}},layout:Tt,workgroupSize:[16,16,1],wgsl:`
fn loadClamped(coords: vec2<i32>) -> vec4<f32> {
  let dims = textureDimensions(layout.$.source);
  let c = vec2<i32>(
    clamp(coords.x, 0, i32(dims.x) - 1),
    clamp(coords.y, 0, i32(dims.y) - 1)
  );
  return textureLoad(layout.$.source, c, 0);
}

@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(layout.$.source);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let coords = vec2<i32>(i32(gid.x), i32(gid.y));
  let sharpen = layout.$.params;
  let center = textureLoad(layout.$.source, coords, 0);

  // 3x3 box average as the low-pass; sharpen = center + amount * (center - blur).
  var sum = vec4<f32>(0.0);
  for (var j = -1; j <= 1; j = j + 1) {
    for (var i = -1; i <= 1; i = i + 1) {
      sum = sum + loadClamped(vec2<i32>(coords.x + i, coords.y + j));
    }
  }
  let blurAvg = sum / 9.0;
  // Un-premultiply before differencing: the unsharp diff and overshoot must be
  // computed on straight colour, otherwise the result is scaled by alpha and a
  // sharpened highlight can exceed the (preserved) centre alpha — rgb > a. The
  // sharpened straight colour is re-premultiplied by the centre alpha at the end.
  let centerStraight = center.rgb / max(center.a, 1.0 / 255.0);
  let blurStraight = blurAvg.rgb / max(blurAvg.a, 1.0 / 255.0);
  let diff = centerStraight - blurStraight;
  let lum = abs(dot(diff, vec3<f32>(0.299, 0.587, 0.114)));
  let mask = step(sharpen.threshold, lum);
  let sharpened = clamp(centerStraight + diff * sharpen.amount * mask, vec3<f32>(0.0), vec3<f32>(1.0));
  textureStore(layout.$.outputTexture, coords, vec4<f32>(sharpened * center.a, center.a));
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),Vt=C({precision:{source:"working",output:"working"},id:"filters.sharpen.gaussian",version:1,surface:"internal",category:"filters",paramDefaults:{amount:0,threshold:0,radius:8},paramUi:{amount:{min:0,max:2,step:.01,label:"Amount"},threshold:{min:0,max:1,step:.01,label:"Threshold"},radius:{min:0,max:256,step:1,label:"Radius"}},io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"},recipe:{intermediates:{horizontal:{precision:"working",format:"rgba8unorm",usage:13},blurred:{precision:"working",format:"rgba8unorm",usage:13}},passes:[{op:{id:"filters.blur.gaussian",version:1},in:{source:"source"},out:{kind:"intermediate",name:"horizontal"},params:{radius:"$.radius",sigma:0,direction:P(1,0)}},{op:{id:"filters.blur.gaussian",version:1},in:{source:{kind:"intermediate",name:"horizontal"}},out:{kind:"intermediate",name:"blurred"},params:{radius:"$.radius",sigma:0,direction:P(0,1)}},{op:{id:"filters.sharpen.combine",version:1},in:{source:"source",blurred:{kind:"intermediate",name:"blurred"}},out:"output",params:{amount:"$.amount",threshold:"$.threshold"}}]}}),Ve=i({amount:e,threshold:e}),Bt=t.bindGroupLayout({source:{texture:"float"},blurred:{texture:"float"},outputTexture:{storageTexture:"rgba8unorm"},params:{uniform:Ve}}),Ft=s({precision:{source:"working",blurred:"working",output:"working"},id:"filters.sharpen.combine",version:1,surface:"internal",category:"filters",linearity:"nonlinear-in-rgb",kind:"compute",params:Ve,paramDefaults:{amount:0,threshold:0},layout:Bt,workgroupSize:[16,16,1],wgsl:`
@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(layout.$.source);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let at = vec2<i32>(gid.xy);
  let src = textureLoad(layout.$.source, at, 0);
  let low = textureLoad(layout.$.blurred, at, 0);
  let straight = src.rgb / max(src.a, 1.0 / 255.0);
  let diff = straight - low.rgb / max(low.a, 1.0 / 255.0);
  let mask = step(layout.$.params.threshold, abs(dot(diff, vec3<f32>(0.299, 0.587, 0.114))));
  let rgb = clamp(straight + diff * layout.$.params.amount * mask, vec3<f32>(0), vec3<f32>(1));
  textureStore(layout.$.outputTexture, at, vec4<f32>(rgb * src.a, src.a));
}`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]},blurred:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),Be=i({intensity:e,radius:e,softness:e}),Kt=t.bindGroupLayout({source:{texture:"float"},outputTexture:{storageTexture:"rgba8unorm"},params:{uniform:Be}}),Et=s({precision:{source:"working",output:"working"},id:"filters.vignette",version:1,surface:"published",category:"filters",linearity:"linear-in-rgb",kind:"compute",params:Be,paramDefaults:{intensity:0,radius:.9,softness:.5},paramUi:{intensity:{min:0,max:1,step:.01,label:"Intensity"},radius:{min:.1,max:1.5,step:.01,label:"Radius"},softness:{min:0,max:1,step:.01,label:"Softness"}},layout:Kt,workgroupSize:[16,16,1],wgsl:`
@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(layout.$.source);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let coords = vec2<i32>(i32(gid.x), i32(gid.y));
  let v = layout.$.params;
  let color = textureLoad(layout.$.source, coords, 0);

  // Normalize to [-1, 1] coordinates centered on the frame.
  let uv = vec2<f32>(
    (f32(gid.x) + 0.5) / f32(dims.x) * 2.0 - 1.0,
    (f32(gid.y) + 0.5) / f32(dims.y) * 2.0 - 1.0
  );
  let dist = length(uv);
  let inner = max(0.0, v.radius - v.softness);
  let outer = max(inner + 0.001, v.radius);
  let t = clamp((dist - inner) / (outer - inner), 0.0, 1.0);
  let fade = t * t * (3.0 - 2.0 * t);
  let dim = 1.0 - v.intensity * fade;
  textureStore(layout.$.outputTexture, coords, vec4<f32>(color.rgb * dim, color.a)); // premul: ok — scalar '* dim' preserves rgb <= a
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),Fe=i({intensity:e,radius:e,softness:e,centerX:e,centerY:e,roundness:e}),Ot=t.bindGroupLayout({source:{texture:"float"},outputTexture:{storageTexture:"rgba8unorm"},params:{uniform:Fe}}),It=s({precision:{source:"working",output:"working"},id:"filters.vignette",version:2,surface:"published",category:"filters",linearity:"linear-in-rgb",kind:"compute",params:Fe,paramDefaults:{intensity:0,radius:.9,softness:.5,centerX:.5,centerY:.5,roundness:0},paramUi:{intensity:{min:0,max:1,step:.01,label:"Intensity"},radius:{min:.1,max:1.5,step:.01,label:"Radius"},softness:{min:0,max:1,step:.01,label:"Softness"},centerX:{min:0,max:1,step:.01,label:"Center X"},centerY:{min:0,max:1,step:.01,label:"Center Y"},roundness:{min:-1,max:1,step:.01,label:"Roundness",notes:"-1 rounded rectangle, 0 frame oval, 1 circle"}},layout:Ot,workgroupSize:[16,16,1],wgsl:`
@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(layout.$.source);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let coords = vec2<i32>(gid.xy);
  let v = layout.$.params;
  let color = textureLoad(layout.$.source, coords, 0);
  let uv = (vec2<f32>(gid.xy) + vec2<f32>(0.5)) / vec2<f32>(dims) * 2.0
    - vec2<f32>(v.centerX, v.centerY) * 2.0;
  let axis = mix(vec2<f32>(1.0), vec2<f32>(dims) / f32(min(dims.x, dims.y)), clamp(v.roundness, 0.0, 1.0));
  let square = clamp(-v.roundness, 0.0, 1.0);
  let scaled = abs(uv * axis);
  let power = 2.0 + 6.0 * square;
  var distance = length(scaled);
  if (square > 0.0) { distance = pow(pow(scaled.x, power) + pow(scaled.y, power), 1.0 / power); }
  let inner = max(0.0, v.radius - v.softness);
  let outer = max(inner + 0.001, v.radius);
  let t = clamp((distance - inner) / (outer - inner), 0.0, 1.0);
  let fade = t * t * (3.0 - 2.0 * t);
  let dim = 1.0 - v.intensity * fade;
  textureStore(layout.$.outputTexture, coords, vec4<f32>(color.rgb * dim, color.a));
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),Ke=i({amount:e,size:e,colorAmount:e,seed:e}),Wt=t.bindGroupLayout({source:{texture:"float"},outputTexture:{storageTexture:"rgba8unorm"},params:{uniform:Ke}}),jt=s({precision:{source:"working",output:"working"},id:"filters.grain",version:1,surface:"internal",category:"filters",linearity:"linear-in-rgb",kind:"compute",params:Ke,paramDefaults:{amount:0,size:1,colorAmount:0,seed:0},paramUi:{amount:{min:0,max:1,step:.01,label:"Amount"},size:{min:1,max:16,step:.5,label:"Size"},colorAmount:{min:0,max:1,step:.01,label:"Colour"},seed:{label:"Seed"}},layout:Wt,workgroupSize:[16,16,1],wgsl:`
fn hash31(p: vec3f) -> f32 {
  var p3 = fract(p * 0.1031);
  p3 = p3 + dot(p3, vec3f(p3.y, p3.z, p3.x) + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

/**
 * Approximately Gaussian noise with unit deviation at one lattice point: the
 * sum of three uniform hashes (Irwin-Hall), centred and rescaled. Real grain is
 * the sum of many silver crystals, so its density is bell-shaped, not flat.
 */
fn gaussAt(cell: vec2f, seed: f32) -> f32 {
  let a = hash31(vec3f(cell.x, cell.y, seed));
  let b = hash31(vec3f(cell.x + 57.0, cell.y + 57.0, seed));
  let c = hash31(vec3f(cell.x + 113.0, cell.y + 113.0, seed));
  return (a + b + c - 1.5) * 2.0;
}

/**
 * Smooth value noise over the grain lattice. Interpolating between lattice
 * points turns a large size into soft clumps instead of hard square blocks. At
 * integer coordinates the weights are exactly zero, so size 1 returns the
 * lattice value itself: fine, per-pixel grain.
 */
fn valueNoise(p: vec2f, seed: f32) -> f32 {
  let i = floor(p);
  let f = p - i;
  let u = f * f * (vec2f(3.0) - 2.0 * f);
  let n00 = gaussAt(i, seed);
  let n10 = gaussAt(i + vec2f(1.0, 0.0), seed);
  let n01 = gaussAt(i + vec2f(0.0, 1.0), seed);
  let n11 = gaussAt(i + vec2f(1.0, 1.0), seed);
  return mix(mix(n00, n10, u.x), mix(n01, n11, u.x), u.y);
}

/**
 * Two octaves: the clump at the chosen size and a finer layer at twice the
 * frequency. The doubling and the fixed offset keep every floored coordinate an
 * exact float, so the CPU mirror can reproduce the lattice bit for bit.
 */
fn grainAt(p: vec2f, seed: f32, channel: f32) -> f32 {
  let s = seed + channel * 19.19;
  let coarse = valueNoise(p, s);
  let fine = valueNoise(p * 2.0 + vec2f(17.0, 29.0), s + 7.0);
  return (coarse + 0.5 * fine) * 0.8944;
}

@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(layout.$.source);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let coords = vec2<i32>(i32(gid.x), i32(gid.y));
  let v = layout.$.params;
  let color = textureLoad(layout.$.source, coords, 0);
  if (color.a <= 0.0) {
    textureStore(layout.$.outputTexture, coords, color);
    return;
  }

  // Fold the seed into a small exact integer, then turn it into a whole-pixel
  // shift of the lattice. Frame-time seeds run into the hundreds of thousands,
  // where f32 hashing loses the bits that make consecutive frames differ.
  let folded = v.seed - 8192.0 * floor(v.seed / 8192.0);
  let shift = floor(vec2f(
    hash31(vec3f(folded, 1.7, 9.2)),
    hash31(vec3f(folded, 4.1, 3.3))
  ) * 512.0);
  let p = vec2f(f32(gid.x), f32(gid.y)) / max(v.size, 1.0) + shift;

  let mono = grainAt(p, folded, 0.0);
  var n = vec3f(mono);
  if (v.colorAmount > 0.0) {
    let perChannel = vec3f(
      grainAt(p, folded, 1.0),
      grainAt(p, folded, 2.0),
      grainAt(p, folded, 3.0)
    );
    n = mix(n, perChannel, clamp(v.colorAmount, 0.0, 1.0));
  }

  // Work on the straight colour: grain follows exposure, not coverage.
  let straight = color.rgb / color.a;
  let luma = dot(straight, vec3f(0.2126, 0.7152, 0.0722));
  // Film response: nothing to expose in pure black, strongest through the
  // shadows and midtones, thinning out toward the highlights.
  let response = clamp(luma * 6.0, 0.0, 1.0) * (1.0 - 0.65 * luma * luma);
  let sigma = clamp(v.amount, 0.0, 1.0) * 0.15 * response;
  let grained = clamp(straight + n * sigma, vec3f(0.0), vec3f(1.0));
  // Re-premultiplying a value in 0..1 keeps rgb <= a by construction.
  textureStore(layout.$.outputTexture, coords, vec4<f32>(grained * color.a, color.a));
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),Ee=i({amount:e,size:e,colorAmount:e,seed:e,roughness:e,softness:e}),Ht=t.bindGroupLayout({source:{texture:"float"},outputTexture:{storageTexture:"rgba8unorm"},params:{uniform:Ee}}),qt=s({precision:{source:"working",output:"working"},id:"filters.grain",version:2,surface:"internal",category:"filters",linearity:"nonlinear-in-rgb",kind:"compute",params:Ee,paramDefaults:{amount:0,size:1,colorAmount:0,seed:0,roughness:.5,softness:.25},paramUi:{amount:{min:0,max:1,step:.01,label:"Amount"},size:{min:1,max:16,step:.5,label:"Size"},colorAmount:{min:0,max:1,step:.01,label:"Colour"},seed:{label:"Seed"},roughness:{min:0,max:1,step:.01,label:"Roughness"},softness:{min:0,max:1,step:.01,label:"Softness"}},layout:Ht,workgroupSize:[16,16,1],wgsl:`
// Integer hashing avoids device-dependent float rounding in the noise source.
fn hash31(cell: vec2i, seed: u32) -> f32 {
  var h = (u32(cell.x) * 1597334677u) ^ (u32(cell.y) * 3812015801u) ^ (seed * 2798796415u);
  h = (h ^ (h >> 16u)) * 2246822519u;
  h = (h ^ (h >> 13u)) * 3266489917u;
  h = h ^ (h >> 16u);
  return f32(h >> 8u) / 16777216.0;
}

// Three independent uniforms approximate a Gaussian with unit variance.
fn gaussAt(cell: vec2i, seed: u32) -> f32 {
  let a = hash31(cell, seed);
  let b = hash31(cell, seed + 1013u);
  let c = hash31(cell, seed + 3037u);
  return (a + b + c - 1.5) * 2.0;
}

fn softenedNoise(p: vec2f, seed: u32, softness: f32) -> f32 {
  let center = vec2i(floor(p + vec2f(0.5)));
  let sigma = 0.7 + softness * 0.3;
  let falloff = 0.5 / (sigma * sigma);
  let boundary = exp(-4.0 * falloff);
  var sum = 0.0;
  var energy = 0.0;
  for (var y = -2; y <= 2; y++) {
    for (var x = -2; x <= 2; x++) {
      let cell = center + vec2i(x, y);
      let jitter = vec2f(hash31(cell, seed + 4001u), hash31(cell, seed + 8089u)) - vec2f(0.5);
      let delta = p - (vec2f(cell) + jitter);
      // Overlapping Gaussian lobes with independently jittered centers avoid
      // visible lattice cells. Subtract the radius-2 boundary so taps enter
      // and leave this 5x5 window continuously, including at full softness.
      let weight = max(0.0, exp(-(delta.x * delta.x + delta.y * delta.y) * falloff) - boundary);
      sum = sum + gaussAt(cell, seed) * weight;
      energy = energy + weight * weight;
    }
  }
  return sum / sqrt(energy);
}

fn grainAt(p: vec2f, seed: u32, roughness: f32, softness: f32) -> f32 {
  // Distinct rotations keep both octaves away from the image axes and from
  // each other's lattice. The fine octave is twice the spatial frequency.
  let coarseP = vec2f(p.x * 0.8 - p.y * 0.6, p.x * 0.6 + p.y * 0.8);
  let fineP = vec2f(p.x * 0.9238795 + p.y * 0.3826834, -p.x * 0.3826834 + p.y * 0.9238795) * 2.0;
  let coarse = softenedNoise(coarseP, seed, softness);
  let fine = softenedNoise(fineP + vec2f(17.0, 29.0), seed + 7919u, softness);
  return (coarse + roughness * fine) / sqrt(1.0 + roughness * roughness);
}

fn softLight(base: f32, blend: f32) -> f32 {
  if (blend <= 0.5) {
    return base - (1.0 - 2.0 * blend) * base * (1.0 - base);
  }
  var d = sqrt(base);
  if (base <= 0.25) {
    d = ((16.0 * base - 12.0) * base + 4.0) * base;
  }
  return base + (2.0 * blend - 1.0) * (d - base);
}

@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(layout.$.source);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let coords = vec2i(gid.xy);
  let v = layout.$.params;
  let color = textureLoad(layout.$.source, coords, 0);
  if (color.a <= 0.0 || v.amount <= 0.0) {
    textureStore(layout.$.outputTexture, coords, color);
    return;
  }
  let folded = v.seed - 8192.0 * floor(v.seed / 8192.0);
  let seed = u32(folded);
  // Compensate for the wider overlapping kernel to retain fine size-1 grain.
  let p = (vec2f(gid.xy) / max(v.size, 1.0)) * 1.75;
  let roughness = clamp(v.roughness, 0.0, 1.0);
  let softness = clamp(v.softness, 0.0, 1.0);
  let mono = grainAt(p, seed, roughness, softness);
  var n = vec3f(mono);
  if (v.colorAmount > 0.0) {
    let perChannel = vec3f(
      grainAt(p, seed + 131u, roughness, softness),
      grainAt(p, seed + 262u, roughness, softness),
      grainAt(p, seed + 393u, roughness, softness)
    );
    n = n + (perChannel - n) * clamp(v.colorAmount, 0.0, 1.0);
  }
  let straight = color.rgb / color.a;
  let luma = dot(straight, vec3f(0.2126, 0.7152, 0.0722));
  let response = smoothstep(0.02, 0.28, luma) * (1.0 - smoothstep(0.72, 1.0, luma));
  let sigma = clamp(v.amount, 0.0, 1.0) * 0.2 * response;
  let blend = clamp(vec3f(0.5) + n * sigma, vec3f(0.0), vec3f(1.0));
  let grained = vec3f(softLight(straight.r, blend.r), softLight(straight.g, blend.g), softLight(straight.b, blend.b));
  // Quantize explicitly: storage-texture UNORM conversion differs by device
  // near byte boundaries, and un-premultiplication magnifies that difference.
  let premultiplied = vec4f(clamp(grained, vec3f(0.0), vec3f(1.0)) * color.a, color.a);
  let bytes = floor(premultiplied * 255.0 + vec4f(0.5));
  textureStore(layout.$.outputTexture, coords, bytes / 255.0);
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),Oe=i({cellSize:e}),Nt=t.bindGroupLayout({params:{uniform:Oe},source:{texture:"float"},mask:{texture:"float"},samp:{sampler:"filtering"}}),Yt={magFilter:"linear",minFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"},Xt=s({precision:{source:"working",mask:"fixed",output:"working"},id:"filters.pixelate",version:1,surface:"internal",category:"filters",linearity:"linear-in-rgb",kind:"fragment",params:Oe,paramDefaults:{cellSize:8},paramUi:{cellSize:{min:1,max:128,step:1,label:"Cell size",notes:"pixels"}},layout:Nt,samplers:{samp:Yt},wgsl:`
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let dims = vec2f(textureDimensions(layout.$.source));
  let cell = max(1.0, layout.$.params.cellSize);
  let snapped = (floor(uv * dims / cell) + vec2f(0.5)) * cell / dims;
  let processed = textureSample(layout.$.source, layout.$.samp, snapped);
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  let coverage = textureSample(layout.$.mask, layout.$.samp, uv).a;
  let mixed = mix(src.rgb, processed.rgb, coverage);
  let mixedA = mix(src.a, processed.a, coverage);
  return vec4f(mixed, mixedA);
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]},mask:{colorSpace:"data",alpha:"premultiplied",bindingKinds:["texture_2d"],optional:!0}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),Ie=i({mode:e,amount:e,scale:e,angle:e,time:e,seed:e,softness:e,colorA:p,colorB:p}),Zt=t.bindGroupLayout({params:{uniform:Ie},source:{texture:"float"},mask:{texture:"float"},samp:{sampler:"filtering"}}),Jt=s({precision:{source:"working",mask:"fixed",output:"working"},id:"filters.visualFx",version:1,surface:"internal",category:"filters",linearity:"nonlinear-in-rgb",kind:"fragment",params:Ie,paramDefaults:{mode:0,amount:.5,scale:8,angle:0,time:0,seed:0,softness:.1,colorA:p(.05,.1,.2,1),colorB:p(.9,.4,.2,1)},layout:Zt,samplers:{samp:{magFilter:"linear",minFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"}},wgsl:`
fn hash(p: vec2f) -> f32 {
  let x = u32(i32(p.x));
  let y = u32(i32(p.y));
  var n = x * 374761393u + y * 668265263u + 2246822519u;
  n = (n ^ (n >> 13u)) * 1274126177u;
  n = n ^ (n >> 16u);
  return f32(n & 16777215u) / 16777215.0;
}

fn noise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (vec2f(3.0) - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2f(1.0, 0.0)), u.x),
             mix(hash(i + vec2f(0.0, 1.0)), hash(i + vec2f(1.0)), u.x), u.y);
}

fn fbm(p: vec2f) -> f32 {
  var n = 0.0;
  var amp = 0.5;
  var q = p;
  for (var k = 0; k < 5; k = k + 1) {
    n = n + amp * noise(q);
    q = q * 2.03 + vec2f(11.7, 5.3);
    amp = amp * 0.5;
  }
  return n;
}

fn sampleAt(uv: vec2f) -> vec4f {
  return textureSample(layout.$.source, layout.$.samp, clamp(uv, vec2f(0.0), vec2f(1.0)));
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = layout.$.params;
  let mode = i32(round(p.mode));
  let src = sampleAt(uv);
  let cov = textureSample(layout.$.mask, layout.$.samp, uv).a;
  let dims = vec2f(textureDimensions(layout.$.source));
  let q = uv - vec2f(0.5);
  let strength = max(0.0, p.amount);
  let scale = max(1.0, p.scale);
  var result = src;

  if (mode == 0) { // RGB split
    let delta = vec2f(cos(p.angle), sin(p.angle)) * strength / dims;
    let red = sampleAt(uv + delta);
    let blue = sampleAt(uv - delta);
    result = vec4f(red.r / max(red.a, 1.0 / 255.0) * src.a,
                   src.g,
                   blue.b / max(blue.a, 1.0 / 255.0) * src.a,
                   src.a);
  } else if (mode == 1 || mode == 2) { // spin or zoom blur
    var sum = vec4f(0.0);
    for (var i = 0; i < 13; i = i + 1) {
      let t = (f32(i) - 6.0) / 6.0;
      if (mode == 1) {
        let theta = t * strength * 8.0 / max(dims.x, dims.y);
        let rotated = vec2f(q.x * cos(theta) - q.y * sin(theta), q.x * sin(theta) + q.y * cos(theta));
        sum = sum + sampleAt(vec2f(0.5) + rotated);
      } else {
        sum = sum + sampleAt(uv + q * t * strength / dims * 8.0);
      }
    }
    result = sum / 13.0;
  } else if (mode == 3 || mode == 4 || mode == 12) { // smooth displacement or stepped glitch
    let field = fbm(uv * scale + vec2f(p.time, p.seed));
    var displacement = (field - 0.5) * strength * 20.0;
    if (mode == 4) {
      let row = floor(uv.y * scale * 8.0);
      displacement = (hash(vec2f(row, floor(p.time * 24.0) + p.seed)) - 0.5) * strength * 40.0;
    }
    result = sampleAt(uv + vec2f(displacement / dims.x,
      select(displacement * 0.3 / dims.y, 0.0, mode == 4)));
  } else if (mode == 5) { // halftone
    let luma = dot(src.rgb / max(src.a, 0.00392), vec3f(0.2126, 0.7152, 0.0722));
    let cell = fract(uv * dims / scale) - vec2f(0.5);
    let dotRadius = sqrt(max(0.0, 1.0 - luma)) * 0.62;
    let ink = 1.0 - smoothstep(dotRadius - 0.08, dotRadius + 0.08, length(cell));
    result = vec4f(vec3f(1.0 - ink) * src.a, src.a);
  } else if (mode == 6) { // ordered blue-ish hash dither
    let jitter = (hash(floor(uv * dims) + vec2f(p.seed)) - 0.5) * strength * 2.0 / 255.0;
    result = vec4f(clamp(src.rgb + vec3f(jitter * src.a), vec3f(0.0), vec3f(src.a)), src.a);
  } else if (mode == 7 || mode == 8) { // rays or anamorphic flare
    let a = atan2(q.y, q.x);
    let beam = pow(max(0.0, cos((a - p.angle) * select(8.0, 2.0, mode == 8))), 24.0);
    let falloff = 1.0 / (1.0 + length(q * vec2f(1.0, select(1.0, 8.0, mode == 8))) * scale);
    let light = clamp(beam * falloff * strength, 0.0, 1.0);
    result = vec4f(src.rgb + (vec3f(src.a) - src.rgb) * light * p.colorB.rgb, src.a);
  } else if (mode >= 9 && mode <= 11) { // inner shadow, inner glow, edge highlight
    let reach = scale / dims;
    let shifted = sampleAt(uv + vec2f(cos(p.angle), sin(p.angle)) * reach).a;
    let around = min(min(sampleAt(uv + vec2f(reach.x, 0.0)).a, sampleAt(uv - vec2f(reach.x, 0.0)).a),
                     min(sampleAt(uv + vec2f(0.0, reach.y)).a, sampleAt(uv - vec2f(0.0, reach.y)).a));
    let edge = clamp(src.a - select(shifted, around, mode == 10), 0.0, 1.0) * strength;
    if (mode == 9) {
      result = vec4f(mix(src.rgb, p.colorB.rgb * src.a, clamp(edge, 0.0, 1.0)), src.a);
    } else {
      result = vec4f(src.rgb + (vec3f(src.a) - src.rgb) * clamp(edge, 0.0, 1.0) * p.colorB.rgb, src.a);
    }
  } else if (mode == 13) { // threshold a spatial gradient field
    var field = uv.x;
    if (p.time < 0.5) {
      let direction = vec2f(cos(p.angle), sin(p.angle));
      field = select(select(uv.x, 1.0 - uv.x, direction.x > 0.0), select(uv.y, 1.0 - uv.y, direction.y > 0.0), abs(direction.y) > 0.5);
    } else if (p.time < 1.5) {
      field = distance(uv, vec2f(0.5)) / 0.70710678;
    } else {
      field = clamp(fbm(uv * scale + vec2f(p.seed)), 0.0, 1.0);
    }
    let feather = max(0.001, p.softness);
    let edge = strength * (1.0 + feather);
    let reveal = 1.0 - smoothstep(edge - feather, edge, field);
    result = src * reveal;
  } else if (mode == 14) { // localized warm light leak over the picture
    let center = vec2f(0.5 + sin(p.time * 6.2831853 + p.seed) * 0.3, 0.3);
    let light = exp(-distance(uv, center) * scale * 3.0) * strength;
    result = vec4f(src.rgb + (vec3f(src.a) - src.rgb) * light * p.colorB.rgb, src.a);
  } else if (mode >= 15) {
    var v = 0.0;
    if (mode == 15) { // noise
      v = hash(floor(uv * dims / scale) + vec2f(p.seed, floor(p.time * 24.0)));
    } else if (mode == 16) { // fractal texture
      v = fbm(uv * scale + vec2f(p.time, p.seed));
    } else if (mode == 17) { // conic gradient
      v = fract(atan2(q.y, q.x) / 6.2831853 + p.angle / 6.2831853 + 1.0);
    } else if (mode == 18) { // mesh gradient
      v = 0.5 + 0.25 * sin(uv.x * scale + p.time) + 0.25 * cos(uv.y * scale * 0.7 - p.time);
    } else if (mode == 19) { // animated gradient field
      v = fbm(uv * scale + vec2f(p.time * 0.3, -p.time * 0.2));
    } else if (mode == 20) { // particles
      let cell = floor(uv * scale);
      let local = fract(uv * scale);
      var center = vec2f(hash(cell + vec2f(p.seed)), hash(cell + vec2f(p.seed + 17.0)));
      center.y = fract(center.y + p.time * (0.1 + center.x * 0.2));
      v = pow(1.0 - smoothstep(0.0, 0.15, distance(local, center)), 2.0);
    } else if (mode == 21) { // light leak
      let center = vec2f(0.5 + sin(p.time * 0.7 + p.seed) * 0.6, 0.2);
      v = exp(-distance(uv, center) * scale * 0.5);
    } else { // pattern grid
      let grid = fract(uv * scale);
      v = select(0.0, 1.0, min(min(grid.x, grid.y), min(1.0 - grid.x, 1.0 - grid.y)) < 0.04);
    }
    let color = mix(p.colorA, p.colorB, clamp(v * strength, 0.0, 1.0));
    result = color;
  }
  let mixed = mix(src, result, cov);
  return vec4f(clamp(mixed.rgb, vec3f(0.0), vec3f(mixed.a)), mixed.a);
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]},mask:{colorSpace:"data",alpha:"premultiplied",bindingKinds:["texture_2d"],optional:!0}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),We=i({threshold:e,softness:e}),Qt=t.bindGroupLayout({params:{uniform:We},source:{texture:"float"},samp:{sampler:"filtering"}}),eo={magFilter:"linear",minFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"},ro=s({precision:{source:"working",output:"working"},id:"filters.threshold",version:1,surface:"internal",category:"filters",linearity:"linear-in-rgb",kind:"fragment",params:We,paramDefaults:{threshold:.7,softness:.1},paramUi:{threshold:{min:0,max:1,step:.01,label:"Threshold"},softness:{min:0,max:.5,step:.01,label:"Softness"}},layout:Qt,samplers:{samp:eo},wgsl:`
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  let p = layout.$.params;
  let safeA = max(src.a, 1.0 / 255.0);
  let straight = src.rgb / safeA;
  let luma = dot(straight, vec3f(0.299, 0.587, 0.114));
  let soft = max(p.softness, 0.0001);
  let t = smoothstep(p.threshold - soft, p.threshold + soft, luma);
  return vec4f(src.rgb * t, src.a * t);
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),je=i({row0:p,row1:p,row2:p}),ao=t.bindGroupLayout({params:{uniform:je},source:{texture:"float"},mask:{texture:"float"},samp:{sampler:"filtering"}}),to={magFilter:"nearest",minFilter:"nearest",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"},oo=s({precision:{source:"working",mask:"fixed",output:"working"},id:"filters.convolve3x3",version:1,surface:"internal",category:"filters",linearity:"nonlinear-in-rgb",kind:"fragment",params:je,paramDefaults:{row0:p(0,0,0,0),row1:p(0,1,0,0),row2:p(0,0,0,1)},paramUi:{},layout:ao,samplers:{samp:to},wgsl:`
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let dims = textureDimensions(layout.$.source);
  let px = 1.0 / vec2f(f32(dims.x), f32(dims.y));
  let p = layout.$.params;

  // Un-premultiply every tap so the kernel runs on straight colour. Convolving
  // premultiplied rgb skews the weights against per-pixel alpha and can drive
  // the result above the (preserved) centre alpha, breaking rgb <= a. The
  // result is re-premultiplied by the centre alpha before output.
  let c00 = textureSample(layout.$.source, layout.$.samp, uv + vec2f(-px.x, -px.y));
  let c01 = textureSample(layout.$.source, layout.$.samp, uv + vec2f(   0.0, -px.y));
  let c02 = textureSample(layout.$.source, layout.$.samp, uv + vec2f( px.x, -px.y));
  let c10 = textureSample(layout.$.source, layout.$.samp, uv + vec2f(-px.x,    0.0));
  let centerS = textureSample(layout.$.source, layout.$.samp, uv);
  let c12 = textureSample(layout.$.source, layout.$.samp, uv + vec2f( px.x,    0.0));
  let c20 = textureSample(layout.$.source, layout.$.samp, uv + vec2f(-px.x,  px.y));
  let c21 = textureSample(layout.$.source, layout.$.samp, uv + vec2f(   0.0,  px.y));
  let c22 = textureSample(layout.$.source, layout.$.samp, uv + vec2f( px.x,  px.y));

  let s00 = c00.rgb / max(c00.a, 1.0 / 255.0);
  let s01 = c01.rgb / max(c01.a, 1.0 / 255.0);
  let s02 = c02.rgb / max(c02.a, 1.0 / 255.0);
  let s10 = c10.rgb / max(c10.a, 1.0 / 255.0);
  let s11 = centerS.rgb / max(centerS.a, 1.0 / 255.0);
  let s12 = c12.rgb / max(c12.a, 1.0 / 255.0);
  let s20 = c20.rgb / max(c20.a, 1.0 / 255.0);
  let s21 = c21.rgb / max(c21.a, 1.0 / 255.0);
  let s22 = c22.rgb / max(c22.a, 1.0 / 255.0);

  var acc = s00 * p.row0.x + s01 * p.row0.y + s02 * p.row0.z
          + s10 * p.row1.x + s11 * p.row1.y + s12 * p.row1.z
          + s20 * p.row2.x + s21 * p.row2.y + s22 * p.row2.z;

  let declared = p.row2.w;
  let kSum = p.row0.x + p.row0.y + p.row0.z
           + p.row1.x + p.row1.y + p.row1.z
           + p.row2.x + p.row2.y + p.row2.z;
  let divisor = select(declared, select(1.0, kSum, kSum != 0.0), declared == 0.0);

  acc = acc / divisor + vec3f(p.row0.w);
  let outStraight = clamp(acc, vec3f(0.0), vec3f(1.0));

  let coverage = textureSample(layout.$.mask, layout.$.samp, uv).a;
  let mixedStraight = mix(s11, outStraight, coverage);
  return vec4f(mixedStraight * centerS.a, centerS.a);
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]},mask:{colorSpace:"data",alpha:"premultiplied",bindingKinds:["texture_2d"],optional:!0}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),Ni=i({threshold:e,softness:e,radius:e,intensity:e,tint:M}),io=21,X=13,so=C({precision:{source:"working",output:"working"},id:"filters.glow",version:1,surface:"internal",category:"filters",paramDefaults:{threshold:.7,softness:.1,radius:8,intensity:1,tint:M(1,1,1)},paramUi:{threshold:{min:0,max:1,step:.01,label:"Threshold"},softness:{min:0,max:.5,step:.01,label:"Softness"},radius:{min:0,max:256,step:.5,label:"Radius",notes:"blur radius, px"},intensity:{min:0,max:4,step:.01,label:"Intensity"}},io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"expand:radius"},recipe:{intermediates:{bright:{precision:"working",format:"rgba8unorm",usage:io},blurH:{precision:"working",format:"rgba8unorm",usage:X},blurV:{precision:"working",format:"rgba8unorm",usage:X}},passes:[{op:{id:"filters.threshold",version:1},in:{source:"source"},out:{kind:"intermediate",name:"bright"},params:{threshold:"$.threshold",softness:"$.softness"}},{op:{id:"filters.blur.gaussian",version:1},in:{source:{kind:"intermediate",name:"bright"}},out:{kind:"intermediate",name:"blurH"},params:{radius:"$.radius",sigma:0,direction:P(1,0)}},{op:{id:"filters.blur.gaussian",version:1},in:{source:{kind:"intermediate",name:"blurH"}},out:{kind:"intermediate",name:"blurV"},params:{radius:"$.radius",sigma:0,direction:P(0,1)}},{op:{id:"mixer.add",version:1},in:{source:"source",over:{kind:"intermediate",name:"blurV"}},out:"output",params:{gain:"$.intensity",tint:"$.tint"}}]}}),Yi=i({radius:e,sigma:e}),lo=13,no=C({precision:{source:"working",output:"working"},id:"filters.blur.gaussianSeparable",version:1,surface:"internal",category:"filters",paramDefaults:{radius:4,sigma:0},paramUi:{radius:{min:0,max:256,step:.5,label:"Radius",notes:"blur radius, px"},sigma:{min:0,max:96,step:.1,label:"Sigma",notes:"0 = derived from radius"}},io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"expand:radius"},recipe:{intermediates:{blurH:{precision:"working",format:"rgba8unorm",usage:lo}},passes:[{op:{id:"filters.blur.gaussian",version:1},in:{source:"source"},out:{kind:"intermediate",name:"blurH"},params:{radius:"$.radius",sigma:"$.sigma",direction:P(1,0)}},{op:{id:"filters.blur.gaussian",version:1},in:{source:{kind:"intermediate",name:"blurH"}},out:"output",params:{radius:"$.radius",sigma:"$.sigma",direction:P(0,1)}}]}}),He=i({keyColor:M,tolerance:e,softness:e,spill:e}),uo=t.bindGroupLayout({source:{texture:"float"},outputTexture:{storageTexture:"rgba8unorm"},params:{uniform:He}}),co=s({precision:{source:"working",output:"working"},id:"keyer.chromaKey",version:1,surface:"published",category:"keyer",linearity:"nonlinear-in-rgb",kind:"compute",params:He,paramDefaults:{keyColor:M(0,1,0),tolerance:0,softness:.1,spill:.5},paramUi:{keyColor:{label:"Key color",notes:"normalized sRGB, 0..1 per channel"},tolerance:{min:0,max:1,step:.01,label:"Tolerance"},softness:{min:0,max:1,step:.01,label:"Softness"},spill:{min:0,max:1,step:.01,label:"Spill"}},layout:uo,workgroupSize:[16,16,1],wgsl:`
@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(layout.$.source);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let coords = vec2<i32>(i32(gid.x), i32(gid.y));
  let ck = layout.$.params;
  let color = textureLoad(layout.$.source, coords, 0);

  let dist = length(color.rgb - ck.keyColor);
  let inner = ck.tolerance;
  let outer = ck.tolerance + max(ck.softness, 0.001);
  let mask = clamp((dist - inner) / (outer - inner), 0.0, 1.0);
  let smoothMask = mask * mask * (3.0 - 2.0 * mask);

  // Spill suppression: reduce the key channel toward the average of the
  // other two channels for pixels that are near (but not fully) the key.
  var rgb = color.rgb;
  if (ck.spill > 0.001) {
    let other = (color.r + color.g + color.b - max(color.r, max(color.g, color.b))) * 0.5;
    let keyDom = ck.keyColor.g - max(ck.keyColor.r, ck.keyColor.b);
    if (keyDom > 0.0) {
      rgb.g = mix(rgb.g, min(rgb.g, other), ck.spill * (1.0 - smoothMask));
    } else if (ck.keyColor.b - max(ck.keyColor.r, ck.keyColor.g) > 0.0) {
      rgb.b = mix(rgb.b, min(rgb.b, other), ck.spill * (1.0 - smoothMask));
    } else if (ck.keyColor.r - max(ck.keyColor.g, ck.keyColor.b) > 0.0) {
      rgb.r = mix(rgb.r, min(rgb.r, other), ck.spill * (1.0 - smoothMask));
    }
  }

  // Input is straight per the IO contract: rgb and color.a are independent.
  // Key comparison + spill suppression above are correct in that space. The
  // pool downstream expects premultiplied, so fold the new alpha into rgb on
  // the way out.
  let outAlpha = color.a * smoothMask;
  textureStore(layout.$.outputTexture, coords, vec4<f32>(rgb * outAlpha, outAlpha));
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"straight",bindingKinds:["texture_2d"]}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),qe=i({low:e,high:e,softness:e,invert:e}),po=t.bindGroupLayout({params:{uniform:qe},source:{texture:"float"},samp:{sampler:"filtering"}}),mo={magFilter:"linear",minFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"},fo=s({precision:{source:"working",output:"working"},id:"keyer.lumaKey",version:1,surface:"published",category:"keyer",linearity:"nonlinear-in-rgb",kind:"fragment",params:qe,paramDefaults:{low:0,high:1,softness:.05,invert:0},paramUi:{low:{min:0,max:1,step:.01,label:"Low"},high:{min:0,max:1,step:.01,label:"High"},softness:{min:0,max:.5,step:.01,label:"Softness"},invert:{min:0,max:1,step:1,label:"Invert",notes:"0 keep band / 1 cut band"}},layout:po,samplers:{samp:mo},wgsl:`
${z}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  let p = layout.$.params;
  // Input is premultiplied; compute luma on the underlying straight color so
  // the band thresholds don't drift with a.
  let safeA = max(src.a, 1.0 / 255.0);
  let straight = src.rgb / safeA;
  let luma = luma709(straight);
  let soft = max(p.softness, 0.0001);
  let lowEdge = smoothstep(p.low - soft, p.low + soft, luma);
  let highEdge = 1.0 - smoothstep(p.high - soft, p.high + soft, luma);
  var coverage = lowEdge * highEdge;
  if (p.invert > 0.5) {
    coverage = 1.0 - coverage;
  }
  // Multiply RGB by coverage too so the result stays valid premultiplied.
  return vec4f(src.rgb * coverage, src.a * coverage);
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),Ne=i({invert:e}),go=t.bindGroupLayout({params:{uniform:Ne},source:{texture:"float"},mask:{texture:"float"},samp:{sampler:"filtering"}}),vo={magFilter:"linear",minFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"},ho=s({precision:{source:"working",mask:"fixed",output:"working"},id:"mask.apply",version:1,surface:"published",category:"mask",linearity:"linear-in-rgb",kind:"fragment",params:Ne,paramDefaults:{invert:0},paramUi:{invert:{min:0,max:1,step:1,label:"Invert mask"}},layout:go,samplers:{samp:vo},wgsl:`
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  var coverage = textureSample(layout.$.mask, layout.$.samp, uv).a;
  if (layout.$.params.invert > 0.5) {
    coverage = 1.0 - coverage;
  }
  // Source is premultiplied (rgb = a*C). Scaling alpha by coverage requires
  // scaling RGB by the same factor so the output stays valid premultiplied
  // (rgb <= a). Without this, a 50% mask on opaque white produced rgb=1, a=0.5.
  return vec4f(src.rgb * coverage, src.a * coverage);
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]},mask:{colorSpace:"data",alpha:"premultiplied",bindingKinds:["texture_2d"]}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),Ye=i({mode:e,invert:e}),bo=t.bindGroupLayout({params:{uniform:Ye},source:{texture:"float"},samp:{sampler:"filtering"}}),xo={magFilter:"linear",minFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"},yo=s({precision:{source:"working",output:"fixed"},id:"mask.fromImage",version:1,surface:"internal",category:"mask",linearity:"nonlinear-in-rgb",kind:"fragment",params:Ye,paramDefaults:{mode:1,invert:0},paramUi:{mode:{min:0,max:5,step:1,label:"Mode",notes:"0 alpha / 1 luma / 2 R / 3 G / 4 B / 5 max"},invert:{min:0,max:1,step:1,label:"Invert"}},layout:bo,samplers:{samp:xo},wgsl:`
${z}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  let p = layout.$.params;
  let mode = i32(round(p.mode));
  // Source is premultiplied (rgb = a*C); divide back out so the derived mask
  // reflects the underlying color, not the alpha-dimmed display value. Modes
  // that already pick the alpha channel (mode 0) read src.a directly.
  let safeA = max(src.a, 1.0 / 255.0);
  let straight = src.rgb / safeA;
  var value: f32 = 0.0;
  if (mode == 0) {
    value = src.a;
  } else if (mode == 1) {
    value = luma709(straight);
  } else if (mode == 2) {
    value = straight.r;
  } else if (mode == 3) {
    value = straight.g;
  } else if (mode == 4) {
    value = straight.b;
  } else {
    value = max(max(straight.r, straight.g), straight.b);
  }
  if (p.invert > 0.5) {
    value = 1.0 - value;
  }
  return vec4f(0.0, 0.0, 0.0, clamp(value, 0.0, 1.0));
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]}},output:{colorSpace:"data",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),wo=i({unused:e}),ko=t.bindGroupLayout({source:{texture:"float"},samp:{sampler:"filtering"}}),$o={magFilter:"linear",minFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"},So=s({precision:{source:"fixed",output:"fixed"},id:"mask.invert",version:1,surface:"internal",category:"mask",linearity:"alpha-only",kind:"fragment",params:wo,paramDefaults:{unused:0},layout:ko,samplers:{samp:$o},wgsl:`
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  return vec4f(0.0, 0.0, 0.0, clamp(1.0 - src.a, 0.0, 1.0));
}
`,io:{inputs:{source:{colorSpace:"data",alpha:"premultiplied",bindingKinds:["texture_2d"]}},output:{colorSpace:"data",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),Xe=i({amount:e}),_o=t.bindGroupLayout({params:{uniform:Xe},source:{texture:"float"},base:{texture:"float"},mask:{texture:"float"},samp:{sampler:"filtering"}}),Mo={magFilter:"nearest",minFilter:"nearest",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"},Ao=s({precision:{source:"working",base:"working",mask:"fixed",output:"working"},id:"mask.mix",version:1,surface:"internal",category:"mask",linearity:"linear-in-rgb",kind:"fragment",params:Xe,paramDefaults:{amount:1},paramUi:{amount:{min:0,max:1,step:.01,label:"Amount"}},layout:_o,samplers:{samp:Mo},wgsl:`
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let treated = textureSample(layout.$.source, layout.$.samp, uv);
  let original = textureSample(layout.$.base, layout.$.samp, uv);
  let coverage = clamp(textureSample(layout.$.mask, layout.$.samp, uv).a * layout.$.params.amount, 0.0, 1.0);
  return mix(original, treated, coverage);
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]},base:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]},mask:{colorSpace:"data",alpha:"premultiplied",bindingKinds:["texture_2d"]}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),Ze=i({color:p}),Go=t.bindGroupLayout({params:{uniform:Ze}}),Po=s({precision:{output:"fixed"},id:"sources.solid",version:1,surface:"internal",category:"sources",linearity:"source",kind:"fragment",params:Ze,paramDefaults:{color:p(0,0,0,1)},paramUi:{color:{label:"Color",notes:"RGBA, premultiplied"}},layout:Go,wgsl:`
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  return layout.$.params.color;
}
`,io:{inputs:{},output:{colorSpace:"srgb",alpha:"premultiplied",format:"rgba8unorm",dimensions:"host-specified"},rod:"explicit"}}),Je=i({colorA:p,colorB:p,angle:e,midpoint:e}),Uo=t.bindGroupLayout({params:{uniform:Je}}),Do=s({precision:{output:"fixed"},id:"sources.linearGradient",version:1,surface:"internal",category:"sources",linearity:"source",kind:"fragment",params:Je,paramDefaults:{colorA:p(0,0,0,1),colorB:p(1,1,1,1),angle:0,midpoint:.5},paramUi:{colorA:{label:"Color A"},colorB:{label:"Color B"},angle:{min:-Math.PI,max:Math.PI,step:.01,label:"Angle",notes:"radians"},midpoint:{min:.01,max:.99,step:.01,label:"Midpoint"}},layout:Uo,wgsl:`
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = layout.$.params;
  let c = vec2f(cos(p.angle), sin(p.angle));
  let t01 = clamp(dot(uv - vec2f(0.5), c) + 0.5, 0.0, 1.0);
  let mid = clamp(p.midpoint, 0.01, 0.99);
  var t: f32 = 0.0;
  if (t01 < mid) {
    t = (t01 / mid) * 0.5;
  } else {
    t = 0.5 + ((t01 - mid) / (1.0 - mid)) * 0.5;
  }
  // The colour params arrive premultiplied (hosts premultiply at the colour
  // picker boundary, matching the pool's between-modules invariant), and a mix
  // of premultiplied endpoints is itself premultiplied. Re-multiplying by
  // alpha here would darken translucent stops to rgb*a².
  return mix(p.colorA, p.colorB, t);
}
`,io:{inputs:{},output:{colorSpace:"srgb",alpha:"premultiplied",format:"rgba8unorm",dimensions:"host-specified"},rod:"explicit"}}),Qe=i({colorA:p,colorB:p,cellSize:e}),Lo=t.bindGroupLayout({params:{uniform:Qe}}),zo=s({precision:{output:"fixed"},id:"sources.checkerboard",version:1,surface:"internal",category:"sources",linearity:"source",kind:"fragment",params:Qe,paramDefaults:{colorA:p(.8,.8,.8,1),colorB:p(.2,.2,.2,1),cellSize:16},paramUi:{colorA:{label:"Color A"},colorB:{label:"Color B"},cellSize:{min:1,max:256,step:1,label:"Cell size",notes:"pixels"}},layout:Lo,wgsl:`
struct Out {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@fragment
fn fs_main(in: Out) -> @location(0) vec4f {
  let p = layout.$.params;
  let cell = max(1.0, p.cellSize);
  let coord = vec2i(in.position.xy / cell);
  let parity = (coord.x + coord.y) % 2;
  // The colour params arrive premultiplied (hosts premultiply at the colour
  // picker boundary), so return them as-is. Re-multiplying by alpha here
  // would darken translucent cell colours to rgb*a².
  if (parity == 0) {
    return p.colorA;
  }
  return p.colorB;
}
`,io:{inputs:{},output:{colorSpace:"srgb",alpha:"premultiplied",format:"rgba8unorm",dimensions:"host-specified"},rod:"explicit"}}),er=i({colorInner:p,colorOuter:p,radius:e}),Ro=t.bindGroupLayout({params:{uniform:er}}),To=s({precision:{output:"fixed"},id:"sources.radialGradient",version:1,surface:"internal",category:"sources",linearity:"source",kind:"fragment",params:er,paramDefaults:{colorInner:p(0,0,0,1),colorOuter:p(1,1,1,1),radius:.5},paramUi:{colorInner:{label:"Inner color"},colorOuter:{label:"Outer color"},radius:{min:.01,max:1.5,step:.01,label:"Radius"}},layout:Ro,wgsl:`
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = layout.$.params;
  let r = max(p.radius, 0.0001);
  let t = clamp(distance(uv, vec2f(0.5, 0.5)) / r, 0.0, 1.0);
  // The colour params arrive premultiplied (hosts premultiply at the colour
  // picker boundary); a mix of premultiplied endpoints stays premultiplied.
  // Re-multiplying by alpha here would darken translucent colours to rgb*a².
  return mix(p.colorInner, p.colorOuter, t);
}
`,io:{inputs:{},output:{colorSpace:"srgb",alpha:"premultiplied",format:"rgba8unorm",dimensions:"host-specified"},rod:"explicit"}}),rr=i({colorA:p,colorB:p,rotation:e}),Co=t.bindGroupLayout({params:{uniform:rr}}),Vo=s({precision:{output:"fixed"},id:"sources.angularGradient",version:1,surface:"internal",category:"sources",linearity:"source",kind:"fragment",params:rr,paramDefaults:{colorA:p(0,0,0,1),colorB:p(1,1,1,1),rotation:0},paramUi:{colorA:{label:"Color A"},colorB:{label:"Color B"},rotation:{min:-Math.PI,max:Math.PI,step:.01,label:"Rotation",notes:"radians"}},layout:Co,wgsl:`
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = layout.$.params;
  let delta = uv - vec2f(0.5, 0.5);
  let theta = atan2(delta.y, delta.x) - p.rotation;
  let t = fract(theta / (2.0 * 3.14159265359) + 1.0);
  // The colour params arrive premultiplied (hosts premultiply at the colour
  // picker boundary); a mix of premultiplied endpoints stays premultiplied.
  // Re-multiplying by alpha here would darken translucent colours to rgb*a².
  return mix(p.colorA, p.colorB, t);
}
`,io:{inputs:{},output:{colorSpace:"srgb",alpha:"premultiplied",format:"rgba8unorm",dimensions:"host-specified"},rod:"explicit"}}),ar=i({colorInner:p,colorOuter:p,radius:e}),Bo=t.bindGroupLayout({params:{uniform:ar}}),Fo=s({precision:{output:"fixed"},id:"sources.diamondGradient",version:1,surface:"internal",category:"sources",linearity:"source",kind:"fragment",params:ar,paramDefaults:{colorInner:p(0,0,0,1),colorOuter:p(1,1,1,1),radius:.5},paramUi:{colorInner:{label:"Inner color"},colorOuter:{label:"Outer color"},radius:{min:.01,max:1.5,step:.01,label:"Radius"}},layout:Bo,wgsl:`
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = layout.$.params;
  let d = abs(uv - vec2f(0.5, 0.5));
  let r = max(p.radius, 0.0001);
  let t = clamp((d.x + d.y) / r, 0.0, 1.0);
  // The colour params arrive premultiplied (hosts premultiply at the colour
  // picker boundary); a mix of premultiplied endpoints stays premultiplied.
  // Re-multiplying by alpha here would darken translucent colours to rgb*a².
  return mix(p.colorInner, p.colorOuter, t);
}
`,io:{inputs:{},output:{colorSpace:"srgb",alpha:"premultiplied",format:"rgba8unorm",dimensions:"host-specified"},rod:"explicit"}}),tr=i({mean:e,stddev:e,seed:e}),Ko=t.bindGroupLayout({params:{uniform:tr}}),Eo=s({precision:{output:"fixed"},id:"sources.gaussianNoise",version:1,surface:"internal",category:"sources",linearity:"source",kind:"fragment",params:tr,paramDefaults:{mean:0,stddev:1,seed:0},paramUi:{mean:{min:-1,max:1,step:.01,label:"Mean"},stddev:{min:0,max:4,step:.01,label:"Std Dev"},seed:{label:"Seed"}},layout:Ko,wgsl:`
fn hash21(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.x, p.y, p.x) * 0.1031);
  p3 = p3 + dot(p3, vec3f(p3.y, p3.z, p3.x) + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

fn gauss(p: vec2f, seed: f32) -> f32 {
  let u1 = max(1e-6, hash21(p + vec2f(seed, 0.0)));
  let u2 = hash21(p + vec2f(0.0, seed));
  return sqrt(-2.0 * log(u1)) * cos(6.28318530718 * u2);
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = uv * 4096.0;
  let m = layout.$.params.mean;
  let s = layout.$.params.stddev;
  let base = layout.$.params.seed;
  let r = clamp(((m + gauss(p, base + 1.0) * s) * 128.0 + 128.0) / 255.0, 0.0, 1.0);
  let g = clamp(((m + gauss(p, base + 2.0) * s) * 128.0 + 128.0) / 255.0, 0.0, 1.0);
  let b = clamp(((m + gauss(p, base + 3.0) * s) * 128.0 + 128.0) / 255.0, 0.0, 1.0);
  return vec4f(r, g, b, 1.0);
}
`,io:{inputs:{},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"host-specified"},rod:"explicit"}}),or=i({gain:e,tint:M}),Oo=t.bindGroupLayout({params:{uniform:or},source:{texture:"float"},over:{texture:"float"},samp:{sampler:"filtering"}}),Io={magFilter:"linear",minFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"},Wo=s({precision:{source:"working",over:"working",output:"working"},id:"mixer.add",version:1,surface:"internal",category:"mixer",linearity:"linear-in-rgb",kind:"fragment",params:or,paramDefaults:{gain:1,tint:M(1,1,1)},paramUi:{gain:{min:0,max:4,step:.01,label:"Gain"}},layout:Oo,samplers:{samp:Io},wgsl:`
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let s = textureSample(layout.$.source, layout.$.samp, uv);
  let o = textureSample(layout.$.over, layout.$.samp, uv);
  let g = layout.$.params.gain;
  return clamp(s + o * vec4f(layout.$.params.tint, 1.0) * g, vec4f(0.0), vec4f(1.0));
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]},over:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"union-of-inputs"}}),ir=i({color:p,amount:e}),jo=t.bindGroupLayout({params:{uniform:ir},source:{texture:"float"},samp:{sampler:"filtering"}}),Ho={magFilter:"linear",minFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"},qo=s({precision:{source:"working",output:"working"},id:"mixer.colorOverlay",version:1,surface:"internal",category:"mixer",linearity:"nonlinear-in-rgb",kind:"fragment",params:ir,paramDefaults:{color:p(1,0,0,1),amount:.5},paramUi:{color:{label:"Color",notes:"RGBA, straight alpha"},amount:{min:0,max:1,step:.01,label:"Amount"}},layout:jo,samplers:{samp:Ho},wgsl:`
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  let p = layout.$.params;
  // Blend RGB in straight space, then re-premultiply against the source's
  // own coverage. The output silhouette stays = src.a regardless of color.a
  // or amount — overlay opacity affects colour, not coverage.
  let safeA = max(src.a, 0.0001);
  let straightRgb = src.rgb / safeA;
  let mixedStraight = mix(straightRgb, p.color.rgb, clamp(p.amount * p.color.a, 0.0, 1.0));
  return vec4f(mixedStraight * src.a, src.a);
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),sr=i({color:p,widthPx:e,threshold:e}),No=t.bindGroupLayout({params:{uniform:sr},source:{texture:"float"},samp:{sampler:"filtering"}}),Yo={magFilter:"linear",minFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"},Xo=s({precision:{source:"working",output:"working"},id:"mixer.outline",version:1,surface:"internal",category:"mixer",linearity:"nonlinear-in-rgb",kind:"fragment",params:sr,paramDefaults:{color:p(0,0,0,1),widthPx:2,threshold:.5},paramUi:{color:{label:"Color",notes:"RGBA, straight alpha"},widthPx:{min:0,max:32,step:.5,label:"Width",notes:"pixels"},threshold:{min:0,max:1,step:.01,label:"Alpha threshold"}},layout:No,samplers:{samp:Yo},wgsl:`
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  let p = layout.$.params;
  let dims = vec2f(textureDimensions(layout.$.source));
  let step = p.widthPx / dims;
  // Eight ring samples, π/4 apart, at radius = widthPx. The loop runs
  // unconditionally so the ring textureSample stays in uniform control flow;
  // the result is gated by select() below rather than early returns.
  let dirs = array<vec2f, 8>(
    vec2f(1.0, 0.0),
    vec2f(0.70710678, 0.70710678),
    vec2f(0.0, 1.0),
    vec2f(-0.70710678, 0.70710678),
    vec2f(-1.0, 0.0),
    vec2f(-0.70710678, -0.70710678),
    vec2f(0.0, -1.0),
    vec2f(0.70710678, -0.70710678)
  );
  var maxA: f32 = 0.0;
  for (var i = 0; i < 8; i = i + 1) {
    let s = textureSample(layout.$.source, layout.$.samp, uv + dirs[i] * step);
    maxA = max(maxA, s.a);
  }
  let cov = p.color.a;
  let outline = vec4f(p.color.rgb * cov, cov);
  // Outside the silhouette with a ring neighbour above threshold → outline;
  // outside with no neighbour → transparent black.
  let edge = select(vec4f(0.0), outline, maxA > p.threshold);
  // widthPx <= 0 ("no outline") or inside the silhouette → pass source through.
  // widthPx is a uniform, but the source-alpha test is per-pixel, so both
  // collapse into a single uniform-control-flow select.
  let passthrough = p.widthPx <= 0.0 || src.a > p.threshold;
  return select(edge, src, passthrough);
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),lr=i({color:p,offsetX:e,offsetY:e,intensity:e}),Zo=t.bindGroupLayout({params:{uniform:lr},source:{texture:"float"},shadowMask:{texture:"float"},samp:{sampler:"filtering"}}),Jo={magFilter:"linear",minFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"},Qo=s({precision:{source:"working",shadowMask:"fixed",output:"working"},id:"mixer.shadowCompose",version:1,surface:"internal",category:"mixer",linearity:"linear-in-rgb",kind:"fragment",params:lr,paramDefaults:{color:p(0,0,0,1),offsetX:.02,offsetY:.02,intensity:.6},paramUi:{color:{label:"Shadow color",notes:"RGBA, straight alpha"},offsetX:{min:-.5,max:.5,step:.005,label:"Offset X"},offsetY:{min:-.5,max:.5,step:.005,label:"Offset Y"},intensity:{min:0,max:4,step:.01,label:"Intensity"}},layout:Zo,samplers:{samp:Jo},wgsl:`
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = layout.$.params;
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  let shadowUv = uv - vec2f(p.offsetX, p.offsetY);
  // Sample the mask unconditionally (textureSample must run in uniform control
  // flow) and zero its contribution outside the offset mask's bounds.
  let inBounds = shadowUv.x >= 0.0 && shadowUv.x <= 1.0 && shadowUv.y >= 0.0 && shadowUv.y <= 1.0;
  let shadowSample = textureSample(layout.$.shadowMask, layout.$.samp, shadowUv);
  let shadowA = select(0.0, shadowSample.a, inBounds);
  let cov = clamp(shadowA * p.color.a * p.intensity, 0.0, 1.0);
  let shadow = vec4f(p.color.rgb * cov, cov);
  // source over shadow: out = src + shadow * (1 - src.a). Both premultiplied.
  return src + shadow * (1.0 - src.a);
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]},shadowMask:{colorSpace:"data",alpha:"premultiplied",bindingKinds:["texture_2d"]}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"union-of-inputs"}}),Xi=i({color:p,offsetX:e,offsetY:e,radius:e,intensity:e}),ei=21,Z=13,ri=C({precision:{source:"working",output:"working"},id:"mixer.dropShadow",version:1,surface:"internal",category:"mixer",paramDefaults:{color:p(0,0,0,1),offsetX:.02,offsetY:.02,radius:8,intensity:.6},paramUi:{color:{label:"Shadow color",notes:"RGBA, straight alpha"},offsetX:{min:-.5,max:.5,step:.005,label:"Offset X"},offsetY:{min:-.5,max:.5,step:.005,label:"Offset Y"},radius:{min:0,max:256,step:.5,label:"Radius",notes:"blur radius, px"},intensity:{min:0,max:4,step:.01,label:"Intensity"}},io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"expand:radius"},recipe:{intermediates:{mask:{precision:"fixed",role:"mask",format:"rgba8unorm",usage:ei},blurH:{precision:"fixed",role:"mask",format:"rgba8unorm",usage:Z},blurV:{precision:"fixed",role:"mask",format:"rgba8unorm",usage:Z}},passes:[{op:{id:"mask.fromImage",version:1},in:{source:"source"},out:{kind:"intermediate",name:"mask"},params:{mode:0,invert:0}},{op:{id:"filters.blur.gaussian",version:1},in:{source:{kind:"intermediate",name:"mask"}},out:{kind:"intermediate",name:"blurH"},params:{radius:"$.radius",sigma:0,direction:P(1,0)}},{op:{id:"filters.blur.gaussian",version:1},in:{source:{kind:"intermediate",name:"blurH"}},out:{kind:"intermediate",name:"blurV"},params:{radius:"$.radius",sigma:0,direction:P(0,1)}},{op:{id:"mixer.shadowCompose",version:1},in:{source:"source",shadowMask:{kind:"intermediate",name:"blurV"}},out:"output",params:{color:"$.color",offsetX:"$.offsetX",offsetY:"$.offsetY",intensity:"$.intensity"}}]}}),nr=i({opacity:e}),ai=t.bindGroupLayout({params:{uniform:nr},source:{texture:"float"},over:{texture:"float"},samp:{sampler:"filtering"}}),ti={magFilter:"linear",minFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"},oi=s({precision:{source:"working",over:"working",output:"working"},id:"mixer.over",version:1,surface:"internal",category:"mixer",linearity:"linear-in-rgb",kind:"fragment",params:nr,paramDefaults:{opacity:1},paramUi:{opacity:{min:0,max:1,step:.01,label:"Opacity"}},layout:ai,samplers:{samp:ti},wgsl:`
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let s = textureSample(layout.$.source, layout.$.samp, uv);
  let o = textureSample(layout.$.over, layout.$.samp, uv) * layout.$.params.opacity;
  return o + s * (1.0 - o.a);
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]},over:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),ur=i({axes:e}),ii=t.bindGroupLayout({params:{uniform:ur},source:{texture:"float"},samp:{sampler:"filtering"}}),si={magFilter:"linear",minFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"},li=s({precision:{source:"working",output:"working"},id:"transform.mirror",version:1,surface:"internal",category:"transform",linearity:"linear-in-rgb",kind:"fragment",params:ur,paramDefaults:{axes:1},paramUi:{axes:{min:0,max:3,step:1,label:"Axes",notes:"0 none / 1 H / 2 V / 3 both"}},layout:ii,samplers:{samp:si},wgsl:`
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let axes = i32(round(layout.$.params.axes));
  let flipH = (axes & 1) != 0;
  let flipV = (axes & 2) != 0;
  var u = uv;
  if (flipH) { u.x = 1.0 - u.x; }
  if (flipV) { u.y = 1.0 - u.y; }
  return textureSample(layout.$.source, layout.$.samp, u);
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),cr=i({dx:e,dy:e,wrap:e}),ni=t.bindGroupLayout({params:{uniform:cr},source:{texture:"float"},samp:{sampler:"filtering"}}),ui={magFilter:"linear",minFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"},ci=s({precision:{source:"working",output:"working"},id:"transform.offset",version:1,surface:"internal",category:"transform",linearity:"linear-in-rgb",kind:"fragment",params:cr,paramDefaults:{dx:0,dy:0,wrap:0},paramUi:{dx:{min:-1,max:1,step:.01,label:"Offset X"},dy:{min:-1,max:1,step:.01,label:"Offset Y"},wrap:{min:0,max:2,step:1,label:"Wrap",notes:"0 clamp / 1 repeat / 2 mirror"}},layout:ni,samplers:{samp:ui},wgsl:`
fn applyWrap(u: vec2f, mode: i32) -> vec2f {
  if (mode == 1) {
    return fract(u);
  }
  if (mode == 2) {
    let q = fract(u * 0.5) * 2.0;
    return vec2f(
      select(q.x, 2.0 - q.x, q.x > 1.0),
      select(q.y, 2.0 - q.y, q.y > 1.0)
    );
  }
  return clamp(u, vec2f(0.0), vec2f(1.0));
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = layout.$.params;
  let mode = i32(round(p.wrap));
  let shifted = uv - vec2f(p.dx, p.dy);
  let u = applyWrap(shifted, mode);
  return textureSample(layout.$.source, layout.$.samp, u);
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),pr=i({originX:e,originY:e,width:e,height:e}),pi=t.bindGroupLayout({params:{uniform:pr},source:{texture:"float"},samp:{sampler:"filtering"}}),mi={magFilter:"linear",minFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"},di=s({precision:{source:"working",output:"working"},id:"transform.crop",version:1,surface:"internal",category:"transform",linearity:"linear-in-rgb",kind:"fragment",params:pr,paramDefaults:{originX:0,originY:0,width:1,height:1},paramUi:{originX:{min:0,max:1,step:.01,label:"Origin X"},originY:{min:0,max:1,step:.01,label:"Origin Y"},width:{min:.01,max:1,step:.01,label:"Width"},height:{min:.01,max:1,step:.01,label:"Height"}},layout:pi,samplers:{samp:mi},wgsl:`
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = layout.$.params;
  let sampleUv = vec2f(
    p.originX + uv.x * p.width,
    p.originY + uv.y * p.height
  );
  // Sample unconditionally (textureSample must run in uniform control flow);
  // select transparent black for taps outside the crop region.
  let oob = sampleUv.x < 0.0 || sampleUv.x > 1.0 || sampleUv.y < 0.0 || sampleUv.y > 1.0;
  let col = textureSample(layout.$.source, layout.$.samp, sampleUv);
  return select(col, vec4f(0.0), oob);
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"derived"},rod:"explicit"}}),mr=i({left:e,top:e,right:e,bottom:e,color:p}),fi=t.bindGroupLayout({params:{uniform:mr},source:{texture:"float"},samp:{sampler:"filtering"}}),gi={magFilter:"linear",minFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"},vi=s({precision:{source:"working",output:"working"},id:"transform.pad",version:1,surface:"internal",category:"transform",linearity:"linear-in-rgb",kind:"fragment",params:mr,paramDefaults:{left:0,top:0,right:0,bottom:0,color:p(0,0,0,0)},paramUi:{left:{min:0,max:4,step:.01,label:"Left",notes:"× source width"},top:{min:0,max:4,step:.01,label:"Top",notes:"× source height"},right:{min:0,max:4,step:.01,label:"Right",notes:"× source width"},bottom:{min:0,max:4,step:.01,label:"Bottom",notes:"× source height"},color:{label:"Fill color",notes:"RGBA, premultiplied"}},layout:fi,samplers:{samp:gi},wgsl:`
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = layout.$.params;
  let totalW = 1.0 + p.left + p.right;
  let totalH = 1.0 + p.top + p.bottom;
  let uMin = p.left / totalW;
  let uMax = (p.left + 1.0) / totalW;
  let vMin = p.top / totalH;
  let vMax = (p.top + 1.0) / totalH;
  let inPad = uv.x < uMin || uv.x > uMax || uv.y < vMin || uv.y > vMax;
  let sampleUv = vec2f(
    (uv.x - uMin) / (uMax - uMin),
    (uv.y - vMin) / (vMax - vMin)
  );
  // Sample unconditionally (textureSample must run in uniform control flow);
  // select the fill colour for the padded border. uMax-uMin = 1/totalW > 0 so
  // the normalization never divides by zero.
  let col = textureSample(layout.$.source, layout.$.samp, sampleUv);
  return select(col, p.color, inPad);
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"derived"},rod:"explicit"}}),dr=i({tilesX:e,tilesY:e,wrap:e}),hi=t.bindGroupLayout({params:{uniform:dr},source:{texture:"float"},samp:{sampler:"filtering"}}),bi={magFilter:"linear",minFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"},xi=s({precision:{source:"working",output:"working"},id:"transform.tile",version:1,surface:"internal",category:"transform",linearity:"linear-in-rgb",kind:"fragment",params:dr,paramDefaults:{tilesX:2,tilesY:2,wrap:1},paramUi:{tilesX:{min:1,max:32,step:1,label:"Tiles X"},tilesY:{min:1,max:32,step:1,label:"Tiles Y"},wrap:{min:0,max:2,step:1,label:"Wrap",notes:"0 clamp / 1 repeat / 2 mirror"}},layout:hi,samplers:{samp:bi},wgsl:`
fn applyWrap(u: vec2f, mode: i32) -> vec2f {
  if (mode == 2) {
    let q = fract(u * 0.5) * 2.0;
    return vec2f(
      select(q.x, 2.0 - q.x, q.x > 1.0),
      select(q.y, 2.0 - q.y, q.y > 1.0)
    );
  }
  if (mode == 0) {
    return clamp(u, vec2f(0.0), vec2f(1.0));
  }
  return fract(u);
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = layout.$.params;
  let tx = max(1.0, p.tilesX);
  let ty = max(1.0, p.tilesY);
  let mode = i32(round(p.wrap));
  let scaled = vec2f(uv.x * tx, uv.y * ty);
  let u = applyWrap(scaled, mode);
  return textureSample(layout.$.source, layout.$.samp, u);
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),fr=i({mode:e}),yi=t.bindGroupLayout({params:{uniform:fr},source:{texture:"float"},samp:{sampler:"filtering"}}),wi={magFilter:"linear",minFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"},J=`
fn cubicWeight(x: f32) -> f32 {
  // Catmull–Rom (a = -0.5). Symmetric in x.
  let ax = abs(x);
  if (ax < 1.0) {
    return ((1.5 * ax - 2.5) * ax * ax) + 1.0;
  }
  if (ax < 2.0) {
    return (((-0.5 * ax + 2.5) * ax - 4.0) * ax) + 2.0;
  }
  return 0.0;
}

fn sampleBicubic(uv: vec2f, dims: vec2f) -> vec4f {
  // Map UV → texel-center coords, take floor as the kernel anchor, sweep the
  // surrounding 4×4 neighborhood and accumulate weighted samples.
  let center = uv * dims - vec2f(0.5);
  let baseI = floor(center);
  let frac = center - baseI;
  var color = vec4f(0.0);
  var weight: f32 = 0.0;
  for (var j = -1; j <= 2; j = j + 1) {
    let wy = cubicWeight(f32(j) - frac.y);
    for (var i = -1; i <= 2; i = i + 1) {
      let wx = cubicWeight(f32(i) - frac.x);
      let w = wx * wy;
      let texel = baseI + vec2f(f32(i), f32(j)) + vec2f(0.5);
      let u = clamp(texel / dims, vec2f(0.0), vec2f(1.0));
      color = color + textureSample(layout.$.source, layout.$.samp, u) * w;
      weight = weight + w;
    }
  }
  return color / weight;
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let mode = i32(round(layout.$.params.mode));
  let dims = vec2f(textureDimensions(layout.$.source));
  if (mode == 0) {
    let snapped = (floor(uv * dims) + vec2f(0.5)) / dims;
    return textureSample(layout.$.source, layout.$.samp, snapped);
  }
  if (mode == 2) {
    return sampleBicubic(uv, dims);
  }
  return textureSample(layout.$.source, layout.$.samp, uv);
}
`,ki=s({precision:{source:"working",output:"working"},id:"transform.resize",version:1,surface:"internal",category:"transform",linearity:"linear-in-rgb",kind:"fragment",params:fr,paramDefaults:{mode:1},paramUi:{mode:{min:0,max:2,step:1,label:"Mode",notes:"0 nearest / 1 bilinear / 2 bicubic"}},layout:yi,samplers:{samp:wi},wgsl:J,workingWgsl:J.replace("return sampleBicubic(uv, dims);","return clamp(sampleBicubic(uv, dims), vec4f(0.0), vec4f(1.0));"),io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"host-specified"},rod:"explicit"}}),gr=i({turns:e}),$i=t.bindGroupLayout({params:{uniform:gr},source:{texture:"float"},samp:{sampler:"filtering"}}),Si={magFilter:"nearest",minFilter:"nearest",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"},_i=s({precision:{source:"working",output:"working"},id:"transform.rotate90",version:1,surface:"internal",category:"transform",linearity:"linear-in-rgb",kind:"fragment",params:gr,paramDefaults:{turns:1},paramUi:{turns:{min:0,max:3,step:1,label:"Turns (CW)",notes:"0 / 1=90° / 2=180° / 3=270°"}},layout:$i,samplers:{samp:Si},wgsl:`
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let t = i32(round(layout.$.params.turns)) & 3;
  // Map output UV (in the rotated canvas) back to source UV by applying the
  // inverse rotation. Quarter-turn rotation around the canvas center is
  // (u, v) → (1-v, u) for 90° CW; the inverse for sampling is (u, v) → (v, 1-u).
  var s = uv;
  if (t == 1) {
    s = vec2f(uv.y, 1.0 - uv.x);
  } else if (t == 2) {
    s = vec2f(1.0 - uv.x, 1.0 - uv.y);
  } else if (t == 3) {
    s = vec2f(1.0 - uv.y, uv.x);
  }
  return textureSample(layout.$.source, layout.$.samp, s);
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"derived"},rod:"explicit"}}),vr=i({m00:e,m01:e,tx:e,m10:e,m11:e,ty:e}),Mi=t.bindGroupLayout({params:{uniform:vr},source:{texture:"float"},samp:{sampler:"filtering"}}),Ai={magFilter:"linear",minFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"},Gi=s({precision:{source:"working",output:"working"},id:"transform.affine",version:1,surface:"internal",category:"transform",linearity:"linear-in-rgb",kind:"fragment",params:vr,paramDefaults:{m00:1,m01:0,tx:0,m10:0,m11:1,ty:0},paramUi:{m00:{label:"m00",notes:"inverse matrix row 0"},m01:{label:"m01",notes:"inverse matrix row 0"},tx:{label:"tx",notes:"inverse translation X"},m10:{label:"m10",notes:"inverse matrix row 1"},m11:{label:"m11",notes:"inverse matrix row 1"},ty:{label:"ty",notes:"inverse translation Y"}},layout:Mi,samplers:{samp:Ai},wgsl:`
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = layout.$.params;
  let s = vec2f(
    p.m00 * uv.x + p.m01 * uv.y + p.tx,
    p.m10 * uv.x + p.m11 * uv.y + p.ty
  );
  // Sample unconditionally (WGSL requires textureSample in uniform control
  // flow) and select transparent black for out-of-bounds taps. The clamp-to-
  // edge sampler makes the discarded out-of-bounds read harmless.
  let oob = s.x < 0.0 || s.x > 1.0 || s.y < 0.0 || s.y > 1.0;
  let col = textureSample(layout.$.source, layout.$.samp, s);
  return select(col, vec4f(0.0), oob);
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"host-specified"},rod:"explicit"}}),hr=i({h00:e,h01:e,h02:e,h10:e,h11:e,h12:e,h20:e,h21:e}),Pi=t.bindGroupLayout({params:{uniform:hr},source:{texture:"float"},samp:{sampler:"filtering"}}),Ui={magFilter:"linear",minFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"},Di=s({precision:{source:"working",output:"working"},id:"transform.cornerPin",version:1,surface:"internal",category:"transform",linearity:"linear-in-rgb",kind:"fragment",params:hr,paramDefaults:{h00:1,h01:0,h02:0,h10:0,h11:1,h12:0,h20:0,h21:0},paramUi:{h00:{label:"H00"},h01:{label:"H01"},h02:{label:"H02"},h10:{label:"H10"},h11:{label:"H11"},h12:{label:"H12"},h20:{label:"H20"},h21:{label:"H21"}},layout:Pi,samplers:{samp:Ui},wgsl:`
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = layout.$.params;
  let w = p.h20 * uv.x + p.h21 * uv.y + 1.0;
  let degenerate = abs(w) < 1e-6;
  // Guard the perspective divide so u/v stay finite even at the singularity;
  // those pixels are discarded by the select below anyway.
  let wSafe = select(w, 1.0, degenerate);
  let u = (p.h00 * uv.x + p.h01 * uv.y + p.h02) / wSafe;
  let v = (p.h10 * uv.x + p.h11 * uv.y + p.h12) / wSafe;
  // Sample unconditionally (textureSample must run in uniform control flow);
  // select transparent black at the singularity or outside the source.
  let oob = degenerate || u < 0.0 || u > 1.0 || v < 0.0 || v > 1.0;
  let col = textureSample(layout.$.source, layout.$.samp, vec2f(u, v));
  return select(col, vec4f(0.0), oob);
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"explicit"}}),br=i({mode:e}),Li=t.bindGroupLayout({params:{uniform:br},source:{texture:"float"},samp:{sampler:"filtering"}}),zi={magFilter:"linear",minFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"},Ri=s({precision:{source:"working",output:"working"},id:"transform.polarRemap",version:1,surface:"internal",category:"transform",linearity:"linear-in-rgb",kind:"fragment",params:br,paramDefaults:{mode:0},paramUi:{mode:{min:0,max:1,step:1,label:"Mode",notes:"0 rect→polar / 1 polar→rect"}},layout:Li,samplers:{samp:zi},wgsl:`
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let mode = i32(round(layout.$.params.mode));
  let pi = 3.14159265358979;
  if (mode == 0) {
    // rect → polar: output (x, y) lives in (angle, radius) space.
    // Sample the source at the cartesian position that maps to (angle, r).
    let angle = uv.x * (2.0 * pi);
    let r = uv.y;
    let s = vec2f(0.5 + r * 0.5 * cos(angle), 0.5 + r * 0.5 * sin(angle));
    return textureSample(layout.$.source, layout.$.samp, s);
  }
  // polar → rect: treat the source's u-axis as angle and v-axis as radius.
  // Output is a centered disc; convert this output's cartesian (uv) to (r,θ)
  // and sample the source there.
  let centered = uv - vec2f(0.5);
  let r = length(centered) * 2.0;
  var angle = atan2(centered.y, centered.x);
  if (angle < 0.0) {
    angle = angle + 2.0 * pi;
  }
  // Sample unconditionally (textureSample must run in uniform control flow);
  // select transparent black outside the inscribed disc.
  let col = textureSample(layout.$.source, layout.$.samp, vec2f(angle / (2.0 * pi), r));
  return select(col, vec4f(0.0), r > 1.0);
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),xr=i({amountX:e,amountY:e}),Ti=t.bindGroupLayout({params:{uniform:xr},source:{texture:"float"},displacement:{texture:"float"},samp:{sampler:"filtering"}}),Ci={magFilter:"linear",minFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"},Vi=s({precision:{source:"working",displacement:"fixed",output:"working"},id:"transform.displace",version:1,surface:"internal",category:"transform",linearity:"linear-in-rgb",kind:"fragment",params:xr,paramDefaults:{amountX:.05,amountY:.05},paramUi:{amountX:{min:-1,max:1,step:.005,label:"Amount X",notes:"× UV"},amountY:{min:-1,max:1,step:.005,label:"Amount Y",notes:"× UV"}},layout:Ti,samplers:{samp:Ci},wgsl:`
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = layout.$.params;
  // The displacement map is premultiplied like everything in the pool, but its
  // R/G are a straight signed control signal (0.5 = no offset). Un-premultiply
  // to recover the true control values — otherwise a translucent displacement
  // texel biases the offset. Fully transparent texels carry no signal at all
  // (rgb = 0, so the divide would recover 0 → full negative offset);
  // substitute the neutral 0.5 so uncovered map regions leave pixels in place.
  let dispP = textureSample(layout.$.displacement, layout.$.samp, uv);
  let disp = select(
    vec3f(0.5),
    dispP.rgb / max(dispP.a, 1.0 / 255.0),
    dispP.a > 0.0
  );
  let offset = vec2f((disp.r - 0.5) * 2.0 * p.amountX, (disp.g - 0.5) * 2.0 * p.amountY);
  let s = uv + offset;
  // Sample unconditionally (textureSample must run in uniform control flow);
  // select transparent black where the offset pushes UV outside the source.
  let oob = s.x < 0.0 || s.x > 1.0 || s.y < 0.0 || s.y > 1.0;
  let col = textureSample(layout.$.source, layout.$.samp, s);
  return select(col, vec4f(0.0), oob);
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]},displacement:{colorSpace:"data",alpha:"premultiplied",bindingKinds:["texture_2d"]}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),yr=i({amount:e}),Bi=t.bindGroupLayout({params:{uniform:yr},source:{texture:"float"},samp:{sampler:"filtering"}}),Fi={magFilter:"linear",minFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"},Ki=s({precision:{source:"working",output:"working"},id:"transform.spherize",version:1,surface:"internal",category:"transform",linearity:"linear-in-rgb",kind:"fragment",params:yr,paramDefaults:{amount:.5},paramUi:{amount:{min:-1,max:1,step:.01,label:"Amount",notes:"negative pinches, positive bulges"}},layout:Bi,samplers:{samp:Fi},wgsl:`
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let amount = layout.$.params.amount;
  let centered = (uv - vec2f(0.5)) * 2.0;
  let r2 = dot(centered, centered);
  // Inverse map: an output pixel at radius r samples the source at r*factor.
  // To bulge (magnify) the centre, the source radius must be pulled inward
  // (factor < 1 near the centre), so positive amount subtracts. Using
  // 1.0 + amount * (...) inverted this and pinched on positive amount, the
  // opposite of the documented behaviour.
  let factor = 1.0 - amount * (1.0 - r2);
  let warpedUv = centered * factor * 0.5 + vec2f(0.5);
  // Outside the unit circle: passthrough (sample the original uv). Inside:
  // sample the warped uv. textureSample must run in uniform control flow, so
  // pick the source uv up front and sample once.
  let inside = r2 < 1.0;
  let s = select(uv, warpedUv, inside);
  let col = textureSample(layout.$.source, layout.$.samp, s);
  // A strong pinch (amount < 0) can push the warped uv outside [0,1]; those
  // taps become transparent black rather than smearing the edge, matching the
  // out-of-bounds convention in transform.affine / transform.cornerPin.
  let oob = inside && (warpedUv.x < 0.0 || warpedUv.x > 1.0 || warpedUv.y < 0.0 || warpedUv.y > 1.0);
  return select(col, vec4f(0.0), oob);
}
`,io:{inputs:{source:{colorSpace:"encoded-sdr",alpha:"premultiplied",bindingKinds:["texture_2d"]}},output:{colorSpace:"encoded-sdr",alpha:"premultiplied",format:"rgba8unorm",dimensions:"same-as:source"},rod:"same-as:source"}}),Ei=[wa,$a,Ma,Pa,La,Ta,Ba,Ka,Ia,Ha,Ya,Ja,rt,ot,ut,ua,pa,da,ga,ha,xa,st,mt,gt,bt,yt,$t,Mt,Pt,Lt,Rt,Ct,Ft,Et,It,jt,qt,Xt,Jt,ro,oo,co,fo,ho,yo,So,Ao,Po,Do,zo,To,Vo,Fo,Eo,Wo,qo,Xo,Qo,oi,li,ci,di,vi,xi,ki,_i,Gi,Di,Ri,Vi,Ki,ae,re],Oi=[Vt,so,no,ri],Ii=[...Ei,...Oi];function Zi(){const r=new Cr;return r.registerAll(Ii),r}export{$t as $,Ao as A,ae as At,Jt as B,Eo as C,da as Ct,zo as D,C as Dt,To as E,qi as Et,co as F,Cr as Ft,Et as G,qt as H,no as I,Hi as It,Ct as J,Ft as K,so as L,s as Lt,yo as M,Ir as Mt,ho as N,Wr as Nt,Do as O,ta as Ot,fo as P,Kr as Pt,Mt as Q,oo as R,A as Rt,Wo as S,ga as St,Vo as T,pa as Tt,jt as U,Xt as V,It as W,Lt as X,Rt as Y,Pt as Z,oi as _,Ma as _t,Ki as a,st as at,Xo as b,xa as bt,Di as c,Ja as ct,ki as d,Ia as dt,yt as et,xi as f,Ka as ft,li as g,Pa as gt,ci as h,La as ht,Ei as i,ut as it,So as j,re as jt,Po as k,aa as kt,Gi as l,Ya as lt,di as m,Ta as mt,Ii as n,gt as nt,Vi as o,ot,vi as p,Ba as pt,Vt as q,Oi as r,mt as rt,Ri as s,rt as st,Zi as t,bt as tt,_i as u,Ha as ut,ri as v,$a as vt,Fo as w,ua as wt,qo as x,ha as xt,Qo as y,wa as yt,ro as z};
