import { createCanvas, ImageData, type Canvas } from "@napi-rs/canvas";
import { describe, expect, it, vi } from "vitest";
import { getNodeGPUDevice } from "@nodetool-ai/gpu/node";
import { drawTimelineFrame, type CompositeContext2D } from "../src/render/canvas2d.js";
import { HeadlessFrameCompositor } from "../src/render/frameCompositor.js";
import { compileClipAnimations } from "../src/animation/compile.js";
import { resolveAnimatedStyleTracks } from "../src/animation/styleTracks.js";
import * as cubeLut from "../src/render/cubeLut.js";
import type { KnownClipEffect } from "../src/types.js";

function surface(width: number, height: number): { surface: Canvas; ctx: CompositeContext2D<Canvas> } {
  const canvas = createCanvas(width, height);
  return { surface: canvas, ctx: canvas.getContext("2d") as unknown as CompositeContext2D<Canvas> };
}

async function comparePixels(width: number, height: number, rgba: Uint8ClampedArray, effect: KnownClipEffect, neighbors?: {before: Uint8ClampedArray; after: Uint8ClampedArray}): Promise<{
  meanError: number;
  maxError: number;
  cpu: Uint8ClampedArray;
  gpu: Uint8Array;
}> {
  const source = createCanvas(width, height);
  source.getContext("2d").putImageData(new ImageData(rgba, width, height), 0, 0);
  const canvasFor = (rgba: Uint8ClampedArray): Canvas => { const c=createCanvas(width,height);c.getContext("2d").putImageData(new ImageData(rgba,width,height),0,0);return c; };
  const temporalSources = neighbors ? {before: canvasFor(neighbors.before),after: canvasFor(neighbors.after)} : undefined;
  const output = createCanvas(width, height);
  const report = drawTimelineFrame(
    output.getContext("2d") as unknown as CompositeContext2D<Canvas>,
    [{ source, temporalSources, sourceWidth: width, sourceHeight: height, opacity: 1, blendMode: "normal", zIndex: 0, effects: [effect] }],
    { canvasWidth: width, canvasHeight: height },
    { alpha: true, effectSurface: surface, projectiveSurface: surface, maskSurface: surface, maskScratch: surface }
  );
  expect(report.degraded).toEqual([]);
  const cpu = output.getContext("2d").getImageData(0, 0, width, height).data;
  const compositor = new HeadlessFrameCompositor(await getNodeGPUDevice(), width, height);
  try {
    const gpu = await compositor.renderFrame([{
      id: "effect", opacity: 1, blendMode: "normal", zIndex: 0, effects: [effect],
      source: { rgba: new Uint8Array(rgba), width, height, version: "source" },
      temporalSources: neighbors ? {before:{rgba:new Uint8Array(neighbors.before),width,height,version:"before"},after:{rgba:new Uint8Array(neighbors.after),width,height,version:"after"}} : undefined
    }], [], { alpha: true });
    let sum = 0;
    let maxError = 0;
    for (let index = 0; index < gpu.length; index++) {
      const difference = Math.abs(cpu[index]! - gpu[index]!);
      sum += difference;
      maxError = Math.max(maxError, difference);
    }
    return { meanError: sum / gpu.length, maxError, cpu, gpu };
  } finally {
    compositor.dispose();
  }
}

describe("effect parity on diagnostic pixels", () => {
  it("preserves translucent colored detail during noise reduction",async()=>{
    const width=32,height=16,source=new Uint8ClampedArray(width*height*4);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)source.set([40+x*4,90+y*3,150-x*2,x<4?0:x<12?128:255],(y*width+x)*4);
    const before=source.map((value,index)=>index%4===3?value:Math.max(0,value-3));
    const after=source.map((value,index)=>index%4===3?value:Math.min(255,value+3));
    const result=await comparePixels(width,height,source,{id:"d",type:"denoise",enabled:true,lumaStrength:.6,chromaStrength:1,temporalStrength:1,radius:3},{before,after});
    for(let i=0;i<source.length;i+=4){
      const ca=result.cpu[i+3]!,ga=result.gpu[i+3]!;
      expect(ca).toBe(source[i+3]);expect(ga).toBe(source[i+3]);
      for(let c=0;c<3;c++)expect(Math.abs(result.cpu[i+c]!*ca/255-result.gpu[i+c]!*ga/255)).toBeLessThanOrEqual(2);
    }
  });
  it("denoises spatial and moving temporal samples consistently",async()=>{
    const width=32,height=16;
    const frame=(seed:number,shift:number):Uint8ClampedArray=>{const data=new Uint8ClampedArray(width*height*4);let state=seed;
      for(let y=0;y<height;y++) for(let x=0;x<width;x++){state=(Math.imul(state,1664525)+1013904223)>>>0;const v=(x-shift<16?70:180)+((state>>>24)%21-10);data.set([v,v,v,255],(y*width+x)*4);}return data;};
    const effect:KnownClipEffect={id:"d",type:"denoise",enabled:true,lumaStrength:.7,chromaStrength:.8,temporalStrength:1,radius:2};
    const source=frame(1,0),neighbors={before:frame(2,-2),after:frame(3,2)};
    const result=await comparePixels(width,height,source,effect,neighbors);
    expect(result.maxError).toBeLessThanOrEqual(2);
    const repeat=await comparePixels(width,height,source,effect,neighbors);expect(repeat.gpu).toEqual(result.gpu);
  });
  it("stabilizes with cubic reconstruction and premultiplied alpha", async () => {
    const width=64,height=48,rgba=new Uint8ClampedArray(width*height*4);
    for (let y=0;y<height;y++) { for (let x=0;x<width;x++) {
      const alpha=x<8 ? 0 : x<16 ? 128 : 255;
      rgba.set([x*4,y*5,(x+y)*2,alpha],(y*width+x)*4);
    } }
    const effect: KnownClipEffect={id:"s",type:"stabilize",enabled:true,_matrix:[.92,.025,.025,-.025,.92,.065]};
    const result=await comparePixels(width,height,rgba,effect);
    expect(result.meanError).toBeLessThan(.5);
    // Straight RGB amplifies a one-byte premultiplied rounding difference near transparent edges.
    for (let i=0;i<rgba.length;i+=4) {
      const ca=result.cpu[i+3]!,ga=result.gpu[i+3]!;
      expect(Math.abs(ca-ga)).toBeLessThanOrEqual(1);
      for (let c=0;c<3;c++) {
        expect(Math.abs(result.cpu[i+c]!*ca/255-result.gpu[i+c]!*ga/255)).toBeLessThanOrEqual(2);
        if (ca===255 && ga===255) { expect(Math.abs(result.cpu[i+c]!-result.gpu[i+c]!)).toBeLessThanOrEqual(1); }
      }
    }
    const again=await comparePixels(width,height,rgba,effect); expect(again.gpu).toEqual(result.gpu);
  });
  it("debands dark ramps with stable monochrome dither", async () => {
    const width = 128, height = 16, rgba = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) { for (let x = 0; x < width; x++) {
      const v = Math.floor(x / 8) * 4; rgba.set([v, v, v, 255], (y * width + x) * 4);
    } }
    const effect: KnownClipEffect = {id: "d", type: "deband", enabled: true, strength: 1, range: 8, threshold: 0.04, dither: 1};
    const first = await comparePixels(width, height, rgba, effect);
    const again = await comparePixels(width, height, rgba, effect);
    expect(first.gpu).toEqual(again.gpu);
    expect(new Set(Array.from({length: width * height}, (_, i) => first.gpu[i * 4])).size).toBeGreaterThan(40);
    expect(first.maxError).toBeLessThanOrEqual(1);
  });
  it("qualifies red across the hue seam while retaining unselected blue", async () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255, 255, 0, 4, 255, 255, 0, 128, 255]);
    const result = await comparePixels(4, 1, rgba, {id: "s", type: "secondaryColor", enabled: true, hueWidth: 20, hueSoftness: 20, hueShift: 120});
    for (const pixels of [result.cpu, result.gpu]) {
      expect([...pixels.slice(0, 8)]).toEqual([0, 255, 0, 255, 0, 0, 255, 255]);
      expect(pixels[9]).toBe(255);
      expect(pixels[13]).toBeGreaterThan(100); expect(pixels[13]).toBeLessThan(150);
    }
    expect(result.maxError).toBeLessThanOrEqual(1);
    const curve = await comparePixels(4, 1, rgba, {id: "s", type: "secondaryColor", enabled: true,
      saturationCurve: [{x: 0, y: 0.25}, {x: 1, y: 0.25}]});
    for (const pixels of [curve.cpu, curve.gpu]) { expect([...pixels.slice(0, 4)]).toEqual([191, 64, 64, 255]); }
    expect(curve.maxError).toBeLessThanOrEqual(1);
  });
  it("applies hue saturation curves, blacks and a squared vignette alike on CPU and GPU", async () => {
    const width = 64, height = 16, rgba = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      rgba.set([Math.round(255 * Math.abs(Math.sin(x / 9))), Math.round(255 * y / (height - 1)), Math.round(255 * x / (width - 1)), 255], (y * width + x) * 4);
    }
    const curves = await comparePixels(width, height, rgba, {id: "h", type: "hueSatCurves", enabled: true,
      hueVsSat: [{x: 0, y: 0.2}, {x: 0.5, y: 0.8}, {x: 1, y: 0.2}], hueVsHue: [{x: 0.3, y: 0.6}],
      hueVsLuma: [{x: 0, y: 0.4}, {x: 0.6, y: 0.7}, {x: 1, y: 0.4}], lumaVsSat: [{x: 0, y: 0.5}, {x: 1, y: 0.3}], satVsSat: [{x: 0, y: 0.6}, {x: 1, y: 0.5}]});
    expect(curves.maxError).toBeLessThanOrEqual(2);
    expect(curves.cpu).not.toEqual(rgba);
    const blacks = await comparePixels(width, height, rgba, {id: "e", type: "exposure", enabled: true, blacks: 0.8});
    expect(blacks.maxError).toBeLessThanOrEqual(1);
    const square = await comparePixels(width, height, rgba, {id: "v", type: "vignette", enabled: true, amount: 0.8, radius: 0.8, softness: 0.4, roundness: -0.7});
    expect(square.maxError).toBeLessThanOrEqual(1);
  });
  it("exposes in linear light and compresses highlights before quantizing", async () => {
    const width = 256, height = 1, rgba = new Uint8ClampedArray(width * 4);
    for (let x = 0; x < width; x++) { rgba.set([x, x, x, 255], x * 4); }
    const exposed = await comparePixels(width, height, rgba, {id: "e", type: "exposure", enabled: true, exposure: 1});
    expect(Math.abs(exposed.gpu[128 * 4]! - 176)).toBeLessThanOrEqual(1);
    expect(exposed.maxError).toBeLessThanOrEqual(1);
    const shoulder = await comparePixels(width, height, rgba, {id: "e", type: "exposure", enabled: true, exposure: 1, rolloff: 1});
    for (const pixels of [shoulder.cpu, shoulder.gpu]) {
      expect(pixels[180 * 4]).toBeLessThan(pixels[220 * 4]!);
      expect(pixels[220 * 4]).toBeLessThan(pixels[255 * 4]!);
      expect(pixels[255 * 4]).toBeLessThan(255);
    }
    expect(shoulder.maxError).toBeLessThanOrEqual(1);
  });
  it("renders authored channel bends rather than reducing them to midpoint gamma", async () => {
    const width = 64, height = 16, rgba = new Uint8ClampedArray(width * height * 4);
    for (let index = 0; index < rgba.length; index += 4) { rgba.set([64, 64, 64, 255], index); }
    const result = await comparePixels(width, height, rgba, {id: "curve", type: "curves", enabled: true,
      master: [{x: 0, y: 0}, {x: 1, y: 1}],
      r: [{x: 0, y: 0}, {x: 0.25, y: 0.4}, {x: 0.5, y: 0.5}, {x: 1, y: 1}]});
    for (const pixels of [result.cpu, result.gpu]) {
      expect(pixels[0]).toBeGreaterThanOrEqual(101); expect(pixels[0]).toBeLessThanOrEqual(103);
      expect([...pixels.slice(1, 4)]).toEqual([64, 64, 255]);
    }
    expect(result.maxError).toBeLessThanOrEqual(1);
  });
  it("renders an interpolated generator color in both CPU preview and GPU export", async () => {
    const effect: KnownClipEffect = { id: "field", type: "generator", mode: "conicGradient",
      enabled: true, colorA: "#000000", colorB: "#0000ff", scale: 3 };
    const animation = { id: "color", preset: "custom", role: "emphasis" as const, durationMs: 1000,
      styleTracks: [{ target: "effect.field.colorB", keyframes: [
        { t: 0, value: "#0000ff" }, { t: 1, value: "#ff0000" }
      ] }] };
    const clip = { animations: [animation], effects: [effect] };
    const resolved = resolveAnimatedStyleTracks(clip,
      compileClipAnimations([animation], 1000, { width: 32, height: 32 }), 500).effects?.[0];
    expect(resolved).toMatchObject({ colorB: "#800080ff" });
    const rgba = new Uint8ClampedArray(32 * 32 * 4);
    for (let index = 0; index < rgba.length; index += 4) rgba.set([0, 0, 0, 255], index);
    const before = await comparePixels(32, 32, rgba, effect);
    const after = await comparePixels(32, 32, rgba, resolved as KnownClipEffect);
    expect(after.cpu).not.toEqual(before.cpu);
    expect(after.gpu).not.toEqual(before.gpu);
    expect(after.meanError).toBeLessThanOrEqual(4);
  });

  it("interpolates out-of-range cube knots before clamping the result", async () => {
    const cube = "LUT_3D_SIZE 2\n-1 -1 -1\n2 -1 -1\n-1 2 -1\n2 2 -1\n-1 -1 2\n2 -1 2\n-1 2 2\n2 2 2";
    const rgba = new Uint8ClampedArray(16 * 16 * 4);
    for (let index = 0; index < rgba.length; index += 4) rgba.set([85, 85, 85, 255], index);
    const result = await comparePixels(16, 16, rgba, { id: "lut", type: "lut", enabled: true, cube });
    expect(result.cpu[0]).toBe(0);
    expect(result.maxError, `mean ${result.meanError}`).toBeLessThanOrEqual(2);
  });

  it("uses source pixel units for vertical displacement on a wide image", async () => {
    const width = 192;
    const height = 48;
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) rgba.set([y % 8 < 4 ? 255 : 0, x % 8 < 4 ? 255 : 0, 128, 255], (y * width + x) * 4);
    }
    const result = await comparePixels(width, height, rgba, {
      id: "displacement", type: "stylize", mode: "displacement", enabled: true,
      amount: 2, scale: 8, seed: 3, time: 0.5
    });
    expect(result.meanError).toBeLessThanOrEqual(3);
  });

  it("splits straight RGB channels across an alpha edge", async () => {
    const width = 48;
    const height = 48;
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) rgba.set([255, 255, 255, x < 24 ? 255 : 32], (y * width + x) * 4);
    }
    const result = await comparePixels(width, height, rgba, {
      id: "rgb", type: "stylize", mode: "rgbSplit", enabled: true, amount: 8, angle: 0
    });
    const index = (16 * width + 16) * 4;
    expect([...result.cpu.slice(index, index + 4)]).toEqual([255, 255, 255, 255]);
    expect([...result.gpu.slice(index, index + 4)]).toEqual([255, 255, 255, 255]);
    expect(result.meanError).toBeLessThanOrEqual(3);
  });
});

describe("GPU LUT cache", () => {
  it("parses each cube once per processor and invalidates on content change or disposal", async () => {
    const parse = vi.spyOn(cubeLut, "parseCubeLut");
    const identity = "LUT_3D_SIZE 2\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1";
    const invert = "LUT_3D_SIZE 2\n1 1 1\n0 1 1\n1 0 1\n0 0 1\n1 1 0\n0 1 0\n1 0 0\n0 0 0";
    const rgba = new Uint8Array(4 * 4 * 4);
    for (let index = 0; index < rgba.length; index += 4) rgba.set([85, 85, 85, 255], index);
    const render = async (compositor: HeadlessFrameCompositor, cube: string): Promise<Uint8Array> => compositor.renderFrame([{
      id: "lut", opacity: 1, blendMode: "normal", zIndex: 0,
      effects: [{ id: "cube", type: "lut", enabled: true, cube }],
      source: { rgba, width: 4, height: 4, version: "source" }
    }], [], { alpha: true });
    const device = await getNodeGPUDevice();
    try {
      const first = new HeadlessFrameCompositor(device, 4, 4);
      try {
        expect((await render(first, identity))[0]).toBe(85);
        expect((await render(first, identity))[0]).toBe(85);
        expect(parse).toHaveBeenCalledTimes(1);
        expect((await render(first, invert))[0]).toBe(170);
        expect(parse).toHaveBeenCalledTimes(2);
        expect((await render(first, identity))[0]).toBe(85);
        expect(parse).toHaveBeenCalledTimes(2);
      } finally {
        first.dispose();
      }
      const second = new HeadlessFrameCompositor(device, 4, 4);
      try {
        expect((await render(second, identity))[0]).toBe(85);
        expect(parse).toHaveBeenCalledTimes(3);
      } finally {
        second.dispose();
      }
    } finally {
      parse.mockRestore();
    }
  });
});
