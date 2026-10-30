import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(resolve('package.json'));
const { build } = require('esbuild');
const { chromium } = require('@playwright/test');
const sharp = require('sharp');
const output = process.argv[2];
assert(output, 'An explicit output directory is required');
await mkdir(output, { recursive: true });
const helper = await readFile('native/game/src/render/shaders/anisotropic3d.glsl', 'utf8');
const source = `import * as T from 'three';window.run=()=>{
const renderer=new T.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setSize(256,256);renderer.outputColorSpace=T.LinearSRGBColorSpace;
const pixels=new Uint8Array(1024*1024*4);for(let y=0;y<1024;y++)for(let x=0;x<1024;x++){const i=(y*1024+x)*4;const c=((x>>3)^(y>>3))&1;pixels[i]=c?230:20;pixels[i+1]=((x>>4)&1)?190:40;pixels[i+2]=((y>>2)&1)?210:30;pixels[i+3]=255;}
const texture=new T.DataTexture(pixels,1024,1024);texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;
const geometry=new T.PlaneGeometry(2,2),scene=new T.Scene(),camera=new T.Camera(),target=new T.WebGLRenderTarget(256,256,{depthBuffer:false});
const results=[];for(const angle of [0,.45,1.1]){const images=[];for(const mode of ['reference','helper','wrong']){texture.anisotropy=mode==='reference'?16:1;texture.needsUpdate=true;const fragment=${JSON.stringify(helper)}+'\\nuniform sampler2D map;uniform float angle;in vec2 coords;out vec4 result;void main(){mat2 r=mat2(cos(angle),sin(angle),-sin(angle),cos(angle));vec2 uv=r*vec2(coords.x*2.,coords.y*32.);'+(mode==='reference'?'result=texture(map,uv);':mode==='helper'?'result=sampleAnisotropic16(map,uv);':'vec2 d=vec2(textureSize(map,0));float lod=log2(max(length(dFdx(uv)*d),length(dFdy(uv)*d)));result=textureLod(map,uv,lod);')+'}';const material=new T.ShaderMaterial({glslVersion:T.GLSL3,uniforms:{map:{value:texture},angle:{value:angle}},vertexShader:'out vec2 coords;void main(){coords=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:fragment,depthTest:false,depthWrite:false,toneMapped:false});const mesh=new T.Mesh(geometry,material);scene.add(mesh);renderer.setRenderTarget(target);renderer.render(scene,camera);const data=new Uint8Array(256*256*4);renderer.readRenderTargetPixels(target,0,0,256,256,data);images.push(Array.from(data));scene.remove(mesh);material.dispose();}
results.push({angle,images});}target.dispose();geometry.dispose();texture.dispose();renderer.dispose();return {version:T.REVISION,results};};`;
const bundle = await build({ stdin: { contents: source, resolveDir: process.cwd() }, bundle: true, platform: 'browser', write: false });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage();
  await page.setContent('<body>Bounded anisotropy reference</body>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const data = await page.evaluate(() => window.run());
  for (let i = 0; i < data.results.length; i++) {
    for (let j = 0; j < 3; j++) {
      await sharp(Buffer.from(data.results[i].images[j]), { raw: { width: 256, height: 256, channels: 4 } })
        .png().toFile(resolve(output, `${i}-${['three', 'helper', 'wrong-lod'][j]}.png`));
    }
  }
  const metrics = data.results.map(({ angle, images }) => {
    const error = image => image.reduce((sum, value, i) => sum + (i % 4 === 3 ? 0 : Math.abs(value - images[0][i])), 0) / (256 * 256 * 3);
    return { angle, helperMae: error(images[1]), wrongMajorLodMae: error(images[2]) };
  });
  await writeFile(resolve(output, 'metrics.json'), JSON.stringify({ threeRevision: data.version, metrics }, null, 2));
  for (const metric of metrics) {
    assert(metric.helperMae < 1, 'Bounded anisotropic residual exceeds 1/255');
    assert(metric.wrongMajorLodMae > metric.helperMae * 1.2, 'Wrong major-axis LOD negative control must fail closer parity');
  }
  console.log(JSON.stringify(metrics));
} finally { await browser.close(); }
