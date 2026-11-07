// Fabric's explicit environment adapter uses the granted native Canvas and the
// existing XML DOM. It supplies the element operations used by StaticCanvas and
// SVG parsing, without installing a browser document or fetching resources.
import { DOMParser } from "@xmldom/xmldom";
import { Canvas, Image } from "./canvas.mjs";
import { Buffer } from "buffer";
export async function loadFabric() {
  const fabric = await import("fabric");
  const document = new DOMParser().parseFromString(
    "<html><body/></html>",
    "text/xml"
  );
  document.body = document.getElementsByTagName("body")[0];
  const createElement = document.createElement.bind(document);
  class FabricCanvas extends Canvas {
    constructor() {
      super(1, 1);
      this.nodeName = "CANVAS";
      this.tagName = "CANVAS";
      this.nodeType = 1;
      this.ownerDocument = document;
      this.style = {
        cssText: "",
        setProperty(name, value) {
          this[name] = value;
        },
        removeProperty(name) {
          delete this[name];
        }
      };
      this.attributes = new Map();
      this.classes = new Set();
      this.classList = {
        add: (name) => this.classes.add(name),
        remove: (name) => this.classes.delete(name)
      };
    }
    hasAttribute(name) {
      return this.attributes.has(name);
    }
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
      if (name === "width" || name === "height") this[name] = Number(value);
    }
    getAttribute(name) {
      return this.attributes.get(name) ?? null;
    }
    removeAttribute(name) {
      this.attributes.delete(name);
    }
    getBoundingClientRect() {
      return { left: 0, top: 0, width: this.width, height: this.height };
    }
    toDataURL(type = "image/png") {
      return `data:${type};base64,${Buffer.from(this.toBuffer(type)).toString("base64")}`;
    }
  }
  class FabricImage extends Image {
    set src(value) {
      if (typeof value === "string" && value.startsWith("data:")) {
        const comma = value.indexOf(",");
        super.src = Buffer.from(
          value.slice(comma + 1),
          value.slice(0, comma).endsWith(";base64") ? "base64" : "utf8"
        );
      } else super.src = value;
    }
  }
  document.createElement = (name) =>
    name === "canvas"
      ? new FabricCanvas()
      : name === "img"
        ? new FabricImage()
        : createElement(name);
  const window = {
    DOMParser,
    devicePixelRatio: 1,
    navigator: { maxTouchPoints: 0 },
    getComputedStyle: (element) => element.style ?? {},
    requestAnimationFrame: (callback) =>
      setTimeout(() => callback(Date.now()), 0),
    cancelAnimationFrame: clearTimeout
  };
  document.defaultView = window;
  fabric.setEnv({
    document,
    window,
    isTouchSupported: false,
    WebGLProbe: { isSupported: () => false },
    dispose() {},
    copyPasteData: {}
  });
  return fabric;
}
