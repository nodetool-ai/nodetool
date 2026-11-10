// Headless Cairo/Pango Canvas subset used by the timeline rasterizers.
import { readFileSync } from "./fs.mjs";
const host = () => {
  if (!globalThis.__host?.canvas)
    throw new Error("canvas: host capability is not installed");
  return globalThis.__host.canvas;
};
function dimensions(w, h) {
  if (
    !Number.isInteger(w) ||
    !Number.isInteger(h) ||
    w < 1 ||
    h < 1 ||
    w > 16384 ||
    h > 16384 ||
    w * h > 16777216
  )
    throw new RangeError("canvas: invalid dimensions");
}
export class ImageData {
  constructor(data, width, height) {
    if (typeof data === "number") {
      height = width;
      width = data;
      dimensions(width, height);
      data = new Uint8ClampedArray(width * height * 4);
    } else {
      height ??= data.length / (width * 4);
      dimensions(width, height);
      if (
        !(data instanceof Uint8ClampedArray) ||
        data.length !== width * height * 4
      )
        throw new TypeError("canvas: invalid ImageData");
    }
    this.data = data;
    this.width = width;
    this.height = height;
  }
}
const defaults = () => ({
  fillStyle: "#000000",
  strokeStyle: "#000000",
  font: "10px sans-serif",
  textAlign: "start",
  textBaseline: "alphabetic",
  globalAlpha: 1,
  globalCompositeOperation: "source-over",
  lineWidth: 1,
  lineCap: "butt",
  lineJoin: "miter",
  dash: [],
  filter: "none",
  shadowColor: "transparent",
  shadowBlur: 0,
  shadowOffsetX: 0,
  shadowOffsetY: 0,
  imageSmoothingEnabled: true
});
class Gradient {
  constructor(kind, coords) {
    this.kind = kind;
    this.coords = coords;
    this.stops = [];
  }
  addColorStop(offset, color) {
    if (
      !Number.isFinite(offset) ||
      offset < 0 ||
      offset > 1 ||
      this.stops.length >= 256
    )
      throw new RangeError("canvas: invalid gradient stop");
    this.stops.push([offset, String(color)]);
  }
}
class Context2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.state = defaults();
    this.stack = [];
  }
  call(op, args) {
    return this.canvas._native.call(op, args, this.state);
  }
  save() {
    if (this.stack.length >= 256)
      throw new RangeError("canvas: save limit exceeded");
    this.call("save", []);
    this.stack.push({ ...this.state, dash: [...this.state.dash] });
  }
  restore() {
    if (!this.stack.length) return;
    this.call("restore", []);
    this.state = this.stack.pop();
  }
  resetTransform() {
    this.setTransform(1, 0, 0, 1, 0, 0);
  }
  setLineDash(dash) {
    if (
      !Array.isArray(dash) ||
      dash.length > 256 ||
      dash.some((n) => !Number.isFinite(n) || n < 0)
    )
      throw new RangeError("canvas: invalid dash");
    this.state.dash = dash.length % 2 ? [...dash, ...dash] : [...dash];
  }
  getLineDash() {
    return [...this.state.dash];
  }
  arc(x, y, r, a, b, ccw = false) {
    this.ellipse(x, y, r, r, 0, a, b, ccw);
  }
  createLinearGradient(...coords) {
    return new Gradient("linear", coords);
  }
  createRadialGradient(...coords) {
    return new Gradient("radial", coords);
  }
  createImageData(w, h) {
    return new ImageData(w, h);
  }
  getImageData(x, y, w, h) {
    dimensions(w, h);
    if (!Number.isInteger(x) || !Number.isInteger(y))
      throw new RangeError("canvas: invalid pixel origin");
    const all = this.canvas._native.pixels(),
      result = new ImageData(w, h);
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++)
        if (
          x + i >= 0 &&
          y + j >= 0 &&
          x + i < this.canvas.width &&
          y + j < this.canvas.height
        )
          result.data.set(
            all.subarray(
              ((y + j) * this.canvas.width + x + i) * 4,
              ((y + j) * this.canvas.width + x + i) * 4 + 4
            ),
            (j * w + i) * 4
          );
    return result;
  }
  putImageData(image, x, y) {
    this.canvas._native.put(image.data, image.width, image.height, x, y);
  }
  drawImage(image, ...rect) {
    let pixels;
    if (image instanceof Canvas) pixels = image._native.pixels();
    else if (image instanceof Image && image._pixels) pixels = image._pixels;
    else
      throw new TypeError("canvas: drawImage needs a decoded Image or Canvas");
    const w = image.width,
      h = image.height;
    if (rect.length === 2) rect = [0, 0, w, h, ...rect, w, h];
    else if (rect.length === 4) rect = [0, 0, w, h, ...rect];
    else if (rect.length !== 8)
      throw new TypeError("canvas: drawImage arguments");
    this.call("drawImage", [pixels, w, h, ...rect]);
  }
}
for (const key of Object.keys(defaults()))
  Object.defineProperty(Context2D.prototype, key, {
    get() {
      return this.state[key];
    },
    set(v) {
      this.state[key] = v;
    }
  });
for (const name of [
  "translate",
  "scale",
  "rotate",
  "setTransform",
  "transform",
  "beginPath",
  "closePath",
  "moveTo",
  "lineTo",
  "bezierCurveTo",
  "quadraticCurveTo",
  "arcTo",
  "rect",
  "ellipse",
  "fill",
  "clip",
  "stroke",
  "fillRect",
  "clearRect",
  "measureText",
  "fillText",
  "strokeText"
])
  Context2D.prototype[name] = function (...args) {
    return this.call(name, args);
  };
export class Canvas {
  constructor(width, height) {
    dimensions(width, height);
    this._width = width;
    this._height = height;
    this._native = host().create(width, height);
    this._context = new Context2D(this);
  }
  get width() {
    return this._width;
  }
  get height() {
    return this._height;
  }
  set width(w) {
    this.resize(w, this.height);
  }
  set height(h) {
    this.resize(this.width, h);
  }
  resize(w, h) {
    dimensions(w, h);
    this._native = host().create(w, h);
    this._width = w;
    this._height = h;
    this._context.state = defaults();
    this._context.stack = [];
  }
  getContext(kind) {
    return kind === "2d" ? this._context : null;
  }
  toBuffer(mime = "image/png") {
    if (mime !== "image/png")
      throw new Error("canvas: only PNG output is supported");
    return globalThis.__host.image.encodePng(
      this._native.pixels(),
      this.width,
      this.height
    );
  }
  // The pixels are copied at the call, so drawing after it does not change
  // the PNG, which is encoded on the run's CPU lane.
  async encode(format = "png") {
    if (format !== "png")
      throw new Error("canvas: only PNG output is supported");
    return this._native.encodePng();
  }
  async convertToBlob(options = {}) {
    const type = options.type ?? "image/png";
    if (type !== "image/png")
      throw new Error("canvas: only PNG output is supported");
    const data = await this._native.encodePng();
    return {
      type,
      size: data.length,
      arrayBuffer: async () =>
        data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
    };
  }
}
export const OffscreenCanvas = Canvas;
export const createCanvas = (w, h) => new Canvas(w, h);
export class Image {
  constructor() {
    this.width = 0;
    this.height = 0;
    this._pixels = null;
  }
  set src(value) {
    const bytes = typeof value === "string" ? readFileSync(value) : value;
    this._decoded(globalThis.__host.image.decode(bytes));
  }
  _decoded(result) {
    this.width = result.width;
    this.height = result.height;
    this._pixels = result.rgba;
    this.onload?.();
  }
  get complete() {
    return !!this._pixels;
  }
  get naturalWidth() {
    return this.width;
  }
  get naturalHeight() {
    return this.height;
  }
}
// Decodes on the run's CPU lane, so a cancel stops a large decode.
export async function loadImage(value) {
  const bytes = typeof value === "string" ? readFileSync(value) : value;
  const image = new Image();
  image._decoded(await globalThis.__host.image.decodeAsync(bytes));
  return image;
}
export const GlobalFonts = {
  registerFromPath(path) {
    return host().registerFont(readFileSync(path));
  },
  register(bytes) {
    return host().registerFont(bytes);
  }
};
export async function loadCanvas() {
  return { createCanvas, Canvas, Image, ImageData, loadImage, GlobalFonts };
}
export function installCanvasGlobals() {
  globalThis.OffscreenCanvas ??= OffscreenCanvas;
  globalThis.ImageData ??= ImageData;
}
