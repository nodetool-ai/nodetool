import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import { createCanvas, loadImage } from "@napi-rs/canvas";

// Run with Node and --conditions=nodetool-dev --import=tsx under a valid software-GL display.
// Closed ambient, mixed-metal environment and smooth direct-specular probes.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const fixtureDirectory = join(
  root,
  "packages/game-renderer/tests/fixtures/native-bsdf-reference"
);
globalThis.bsdfReferenceDirectory =
  process.env.NODETOOL_NATIVE_BSDF_REFERENCE_DIR;
if (!globalThis.bsdfReferenceDirectory) {
  const moduleFile = join(root, "packages/game-renderer/dist/native-game.mjs");
  const factory = (await import(pathToFileURL(moduleFile))).default;
  const wasm = await factory({
    wasmBinary: await readFile(join(dirname(moduleFile), "native-game.wasm"))
  });
  wasm.FS.mkdirTree("/assets");
  const context = wasm._ng_create(),
    fixtures = [];
  try {
    const cases = ["ambient", "mixed-metal", "smooth-specular"];
    for (const name of cases) {
      const documentPath = join(fixtureDirectory, `${name}.json`);
      const document = JSON.parse(await readFile(documentPath, "utf8"));
      const bytes = await readFile(
        join(dirname(documentPath), document.assets[0].path)
      );
      wasm.FS.writeFile(`/assets/${document.assets[0].path}`, bytes);
      const request = new TextEncoder().encode(
        JSON.stringify({
          protocolVersion: 1,
          requestId: name,
          sessionId: "normal-reference",
          operation: "prepareModel",
          manifest: document.assets,
          id: document.assets[0].id
        })
      );
      const pointer = wasm._malloc(request.length);
      wasm.HEAPU8.set(request, pointer);
      const status = wasm._ng_dispatch(context, pointer, request.length);
      wasm._free(pointer);
      const length = wasm._ng_response_length(context);
      if (status !== 0 || length < 1 || length > 16777216)
        throw Error(`WASM admission failed: ${name}`);
      const offset = wasm._ng_response_pointer(context),
        response = JSON.parse(
          new TextDecoder().decode(wasm.HEAPU8.slice(offset, offset + length))
        );
      if (response.status !== "ok") throw Error(JSON.stringify(response));
      fixtures.push({
        name,
        document,
        bytes: Array.from(bytes),
        model: response.result
      });
    }
  } finally {
    wasm._ng_destroy(context);
  }
  const bundle = await build({
    stdin: {
      resolveDir: join(root, "packages/game-renderer"),
      loader: "ts",
      contents: `
import { Mesh } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { nativeFrame3D, nativeGame3dDocument } from "@nodetool-ai/protocol/native-game";
import { createNativeRenderer3D } from "./src/native-cpp/renderer3d.ts";
import { createNativeAssetBroker } from "./src/native-cpp/assets.ts";
import { parseNativePreparedModel } from "./src/native-cpp/model3d-types.ts";
const fixtures = ${JSON.stringify(fixtures)};
function pixels(canvas) { const copy=document.createElement("canvas");copy.width=canvas.width;copy.height=canvas.height;const ctx=copy.getContext("2d");ctx.drawImage(canvas,0,0);return ctx.getImageData(0,0,copy.width,copy.height).data; }
function error(a,b) { let sum=0,changed=0,max=0;for(let i=0;i<a.length;i+=4){let delta=0;for(let c=0;c<3;c++){const d=Math.abs(a[i+c]-b[i+c]);sum+=d;max=Math.max(max,d);delta=Math.max(delta,d);}if(delta>16)changed++;}return {mean:sum/(a.length/4*3*255),changedFraction:changed/(a.length/4),max}; }
window.runBsdfReference=async()=>{const report=[];for(const fixture of fixtures){fixture.document=nativeGame3dDocument.parse(fixture.document);
 const canvas=document.createElement("canvas");document.body.append(canvas);const bytes=new Uint8Array(fixture.bytes),assets=createNativeAssetBroker({assets:fixture.document.assets,fetchBytes:async()=>bytes});await assets.get(fixture.document.assets[0].id);
 const owner=await createNativeRenderer3D({canvas,assets,prepareModel:async()=>parseNativePreparedModel(fixture.model)},fixture.document);owner.resize(256,256);
 const sceneDoc=fixture.document.scenes[0],frame=nativeFrame3D.parse({dimension:"3d",tick:0,generation:0,sceneId:sceneDoc.id,camera:fixture.document.camera,entities:sceneDoc.entities,environment:sceneDoc.environment,events:[],presentationEvents:[],hostRequests:[],queryResults:[],music:[],score:0,health:100,logs:[],hud:[],lighting:{},backgrounds:[]});
 const original=Mesh.prototype.onAfterRender;let world;const nativeMeshes=[];
 Mesh.prototype.onAfterRender=function(renderer,scene,camera,geometry,material){if(material.type==="MeshStandardMaterial"){world=scene;if(!nativeMeshes.includes(this))nativeMeshes.push(this);}};
 owner.render(frame);owner.finishFrame();Mesh.prototype.onAfterRender=original;
 const nativePixels=pixels(canvas),nativePng=canvas.toDataURL();
 const loaded=await new GLTFLoader().parseAsync(bytes.buffer,"");const transform=sceneDoc.entities.find(entity=>entity.visual?.kind==="model").transform;loaded.scene.position.fromArray(transform.position);loaded.scene.quaternion.fromArray(transform.rotation);loaded.scene.scale.fromArray(transform.scale);
 const materials=[];loaded.scene.traverse(object=>{if(object.isMesh){for(const material of Array.isArray(object.material)?object.material:[object.material]){materials.push(material);if(material.map)material.map.anisotropy=owner.stats.modelTextureAnisotropy;if(material.normalMap)material.normalMap.anisotropy=owner.stats.modelTextureAnisotropy;}}});
 nativeMeshes.forEach(mesh=>mesh.visible=false);world.add(loaded.scene);owner.render(frame);owner.finishFrame();const referencePixels=pixels(canvas),referencePng=canvas.toDataURL();

 report.push({name:fixture.name,reference:error(nativePixels,referencePixels),nativePng,referencePng});
 world.remove(loaded.scene);loaded.scene.traverse(object=>{if(object.isMesh)object.geometry.dispose();});materials.forEach(material=>{material.map?.dispose();material.normalMap?.dispose();material.dispose();});owner.dispose();assets.dispose();canvas.remove();
}return report;};`
    },
    bundle: true,
    platform: "browser",
    format: "iife",
    conditions: ["nodetool-dev"],
    write: false
  });
  const browser = await chromium.launch({
    headless: true,
    chromiumSandbox: true,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
  });
  try {
    const page = await browser.newPage();
    await page.route("**/*", (route) =>
      route.request().url() === "http://127.0.0.1/"
        ? route.fulfill({
            contentType: "text/html",
            body: "<!doctype html><body>"
          })
        : route.abort()
    );
    await page.goto("http://127.0.0.1/");
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const reports = await page.evaluate(() => window.runBsdfReference());
    const directory = await mkdtemp(join(tmpdir(), "native-bsdf-reference-"));
    for (const report of reports) {
      for (const key of ["nativePng", "referencePng"]) {
        await writeFile(
          join(directory, `${report.name}-${key}.png`),
          Buffer.from(report[key].split(",")[1], "base64")
        );
        delete report[key];
      }
    }
    globalThis.bsdfReferenceDirectory = directory;
    await writeFile(
      join(directory, "report.json"),
      JSON.stringify(reports, null, 2)
    );
    console.log(directory, JSON.stringify(reports));
    if (
      reports.length !== 3 ||
      reports.some(
        (value) =>
          value.reference.mean > 1 / 255 ||
          value.reference.changedFraction > 0.02
      )
    )
      throw Error("Native BSDF reference differs from GLTFLoader");
  } finally {
    await browser.close();
  }
}
const directory = globalThis.bsdfReferenceDirectory;
const decode = async (path) => {
  const image = await loadImage(await readFile(path));
  const canvas = createCanvas(image.width, image.height),
    ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  return ctx.getImageData(0, 0, image.width, image.height).data;
};
function metrics(a, b) {
  let sum = 0,
    center = 0,
    centerCount = 0,
    max = 0;
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      for (let c = 0; c < 3; c++) {
        const delta = Math.abs(
          a[(y * 256 + x) * 4 + c] - b[(y * 256 + x) * 4 + c]
        );
        sum += delta;
        max = Math.max(max, delta);
        if (x >= 124 && x < 132 && y >= 124 && y < 132) {
          center += delta;
          centerCount++;
        }
      }
    }
  }
  return {
    mean: sum / (256 * 256 * 3 * 255),
    centerMean: center / (centerCount * 255),
    max
  };
}
const player = process.env.NODETOOL_NATIVE_GAME_PLAYER,
  before = process.env.NODETOOL_NATIVE_BSDF_BEFORE_PLAYER;
if (player) {
  const comparisons = [];
  for (const name of ["ambient", "mixed-metal", "smooth-specular"]) {
    const reference = await decode(join(directory, `${name}-referencePng.png`));
    const entry = { name };
    for (const [label, binary] of [
      ["fixed", player],
      ["before", before]
    ]) {
      if (!binary) continue;
      const output = join(directory, `${name}-${label}.png`);
      const result = spawnSync(
        binary,
        [
          join(fixtureDirectory, `${name}.json`),
          "--capture",
          output,
          "--width",
          "256",
          "--height",
          "256",
          "--report",
          join(directory, `${name}-${label}.json`)
        ],
        {
          env: {
            ...process.env,
            QT_QPA_PLATFORM: "xcb",
            QSG_RHI_BACKEND: process.env.QSG_RHI_BACKEND ?? "vulkan"
          },
          encoding: "utf8",
          timeout: 45000
        }
      );
      await writeFile(
        join(directory, `${name}-${label}.log`),
        result.stdout + result.stderr
      );
      if (result.error || result.status !== 0)
        throw Error(
          `Qt BSDF capture failed ${name}/${label}: ${result.error ?? result.status}`
        );
      entry[label] = metrics(reference, await decode(output));
    }
    comparisons.push(entry);
  }
  await writeFile(
    join(directory, "qt-comparison.json"),
    JSON.stringify(comparisons, null, 2)
  );
  for (const entry of comparisons) {
    if (entry.fixed.centerMean > 1 / 255)
      throw Error(
        `Qt BSDF center error exceeds1/255: ${JSON.stringify(entry)}`
      );
    if (entry.before && entry.before.centerMean <= 1 / 255)
      throw Error(
        `Old BSDF did not fail sensitive probe: ${JSON.stringify(entry)}`
      );
  }
}
console.log("BSDF_REFERENCE_DIRECTORY=" + directory);
