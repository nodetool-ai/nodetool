import { createHash } from "node:crypto";
import { readFile, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";
import { build } from "esbuild";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { expect, it } from "vitest";

it("matches the legacy AgX, bloom, vignette and SMAA stack including authored bloom softness", async () => {
  const bundle = await build({
    stdin: {
      resolveDir: resolve("."),
      contents: `
import * as T from 'three';
import {GamePostProcessor3D} from './src/renderer3d/passes/post-processing.ts';
import {createNativePost3D,nativePostTargetBytes} from './src/native-cpp/3d-post.ts';
import {resolveNativeBuiltin} from './src/native-cpp/3d-builtins.ts';
window.runPost=async(fixture)=>{
 const {width:w,height:h}=fixture;
 const renderer=new T.WebGLRenderer({preserveDrawingBuffer:true,antialias:false});renderer.setSize(w,h);renderer.setPixelRatio(1);
 const data=new Uint16Array(w*h*4);
 for(let y=0;y<h;y++)data.set(fixture.rgba16.slice(y*w*4,(y+1)*w*4),(h-1-y)*w*4);
 const texture=new T.DataTexture(data,w,h,T.RGBAFormat,T.HalfFloatType);texture.needsUpdate=true;
 const material=new T.ShaderMaterial({uniforms:{map:{value:texture}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:'uniform sampler2D map;varying vec2 vUv;void main(){gl_FragColor=texture2D(map,vUv);}',depthTest:false,depthWrite:false});
 const scene=new T.Scene();scene.add(new T.Mesh(new T.PlaneGeometry(2,2),material));const camera=new T.Camera();
 const capture=()=>{renderer.getContext().finish();const bytes=new Uint8Array(w*h*4);renderer.getContext().readPixels(0,0,w,h,renderer.getContext().RGBA,renderer.getContext().UNSIGNED_BYTE,bytes);return Array.from(bytes);};
 const gl=renderer.getContext(), debug=gl.getExtension("WEBGL_debug_renderer_info"); const identity={vendor:debug?gl.getParameter(debug.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),version:gl.getParameter(gl.VERSION)};
 const results=[];
 for(const entry of fixture.cases){
  const legacy=new GamePostProcessor3D(renderer);await legacy.configure(entry.postProcessing);legacy.render(scene,camera);const reference=capture();legacy.dispose();
  const native=await createNativePost3D(renderer,new Map([['scene',{postProcessing:entry.postProcessing}]]),resolveNativeBuiltin);native.render(scene,camera,'scene');const actual=capture();native.dispose();results.push({name:entry.name,reference,actual});
 }
 let budgetRejected=false;try{nativePostTargetBytes(8192,8192);}catch{budgetRejected=true;}
 material.dispose();texture.dispose();scene.children[0].geometry.dispose();renderer.dispose();return {results,budgetRejected,identity};
};`
    },
    bundle: true,
    format: "iife",
    platform: "browser",
    write: false,
    conditions: ["nodetool-dev"]
  });
  const directory = process.env.NODETOOL_POSTFX_REPORT_DIR;
  const fixture = directory
    ? JSON.parse(await readFile(join(directory, "fixtures.json"), "utf8"))
    : (() => {
        const width = 128,
          height = 96,
          rgba16: number[] = [];
        // Half-float values chosen exactly representable in both renderers.
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            rgba16.push(
              x > (y * 4) / 3 ? 0x4000 : 0x2800,
              0x3400,
              0x3000,
              0x3c00
            );
          }
        }
        const base = {
          enabled: true,
          toneMapping: "agx",
          antialias: "smaa",
          exposure: 1.15
        };
        const bloom = {
            intensity: 0.65,
            radius: 0.3,
            threshold: 0.45,
            softness: 0.1
          },
          vignette = { intensity: 0.6, radius: 0.3, softness: 0.5 };
        return {
          width,
          height,
          rgba16,
          cases: [
            { name: "agx", postProcessing: base },
            { name: "bloom", postProcessing: { ...base, bloom } },
            { name: "vignette", postProcessing: { ...base, vignette } },
            { name: "combined", postProcessing: { ...base, bloom, vignette } },
            {
              name: "softness",
              postProcessing: {
                ...base,
                bloom: { ...bloom, softness: 0.45 },
                vignette
              }
            }
          ]
        };
      })();
  expect(fixture.cases).toHaveLength(5);
  const browser = await chromium.launch({
    headless: true,
    chromiumSandbox: true,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
  });
  try {
    const page = await browser.newPage();
    await page.route("**/*", (route) =>
      route.request().url() === "http://127.0.0.1/"
        ? route.fulfill({ contentType: "text/html", body: "<!doctype html>" })
        : route.abort()
    );
    await page.goto("http://127.0.0.1/");
    await page.addScriptTag({ content: bundle.outputFiles![0].text });
    const result = await page.evaluate(
      (f) => Reflect.get(window, "runPost")(f),
      fixture
    );
    expect(result.budgetRejected).toBe(true);
    const report = [];
    for (const entry of result.results) {
      let max = 0,
        sum = 0;
      for (let i = 0; i < entry.actual.length; i++) {
        const delta = Math.abs(entry.actual[i] - entry.reference[i]);
        max = Math.max(max, delta);
        sum += delta;
      }
      report.push({ name: entry.name, max, mean: sum / entry.actual.length });
      expect(max, entry.name).toBeLessThanOrEqual(1);
      if (directory) {
        const image = await loadImage(
          await readFile(join(directory, `${entry.name}-native.png`))
        );
        const canvas = createCanvas(fixture.width, fixture.height),
          context = canvas.getContext("2d");
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(
          0,
          0,
          fixture.width,
          fixture.height
        ).data;
        let nativeMax = 0,
          nativeSum = 0,
          changed = 0;
        for (let y = 0; y < fixture.height; y++) {
          for (let x = 0; x < fixture.width; x++) {
            for (let c = 0; c < 3; c++) {
              const delta = Math.abs(
                pixels[(y * fixture.width + x) * 4 + c] -
                  entry.reference[
                    ((fixture.height - 1 - y) * fixture.width + x) * 4 + c
                  ]
              );
              nativeMax = Math.max(nativeMax, delta);
              nativeSum += delta;
              if (delta > 16) {
                changed++;
              }
            }
          }
        }
        report.push({
          name: `${entry.name}-qt-reference`,
          max: nativeMax,
          mean: nativeSum / (fixture.width * fixture.height * 3),
          changedFraction: changed / (fixture.width * fixture.height * 3)
        });
        expect(
          nativeSum / (fixture.width * fixture.height * 3),
          `${entry.name} Qt mean RGB delta`
        ).toBeLessThanOrEqual(1);
        expect(
          changed / (fixture.width * fixture.height * 3),
          `${entry.name} Qt >16 delta fraction`
        ).toBeLessThanOrEqual(0.02);
      }
    }
    expect(
      result.results.find(
        (entry: { name: string; actual: number[] }) => entry.name === "softness"
      ).actual
    ).not.toEqual(
      result.results.find(
        (entry: { name: string; actual: number[] }) => entry.name === "combined"
      ).actual
    );
    const artifacts = await mkdtemp(join(tmpdir(), "native-post-reference-"));
    await writeFile(
      join(artifacts, "comparison.json"),
      JSON.stringify(
        {
          browser: browser.version(),
          identity: result.identity,
          width: fixture.width,
          height: fixture.height,
          fixtureSha256: createHash("sha256")
            .update(JSON.stringify(fixture))
            .digest("hex"),
          bundleSha256: createHash("sha256")
            .update(bundle.outputFiles![0].contents)
            .digest("hex"),
          comparisons: report,
          captureDigests: result.results.map(
            (entry: {
              name: string;
              reference: number[];
              actual: number[];
            }) => ({
              name: entry.name,
              referenceRgbaBottomUpSha256: createHash("sha256")
                .update(Uint8Array.from(entry.reference))
                .digest("hex"),
              actualRgbaBottomUpSha256: createHash("sha256")
                .update(Uint8Array.from(entry.actual))
                .digest("hex")
            })
          )
        },
        null,
        2
      )
    );
  } finally {
    await browser.close();
  }
}, 30000);
