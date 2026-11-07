// Optional packages are registered explicitly by the Code host. Nothing falls
// back to require(), a process environment, or a filesystem package resolver.
import {
  ReadableStream,
  WritableStream,
  TransformStream
} from "web-streams-polyfill";
import { Buffer } from "buffer";
import DOMMatrix from "happy-dom/lib/dom/dom-matrix/DOMMatrix.js";
import Blob from "happy-dom/lib/file/Blob.js";
import { Response } from "../env/response.mjs";
import { loadCanvas } from "./canvas.mjs";
import { loadSharp } from "./image.mjs";
const loaders = {
  exceljs: () => import("exceljs"),
  "js-tiktoken": () => import("js-tiktoken"),
  docx: async () => {
    const module = await import("docx");
    return {
      ...module,
      Packer: {
        toBuffer: (document) =>
          module.Packer.toArrayBuffer(document).then(
            (buffer) => new Uint8Array(buffer)
          )
      }
    };
  },
  mammoth: async () => {
    const imported = await import("mammoth/mammoth.browser.js");
    const module = imported.default ?? imported;
    const input = ({ buffer, ...options }) => ({
      ...options,
      arrayBuffer: buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength
      )
    });
    return {
      ...module,
      extractRawText: (options) => module.extractRawText(input(options)),
      convertToHtml: (options) => module.convertToHtml(input(options))
    };
  },
  "pdf-lib": () => import("pdf-lib"),
  "@llamaindex/liteparse": async () => {
    // Its pdf.js patches Blob.prototype and Response.prototype when it loads.
    globalThis.DOMMatrix ??= DOMMatrix;
    globalThis.Blob ??= Blob;
    globalThis.Response ??= Response;
    return import("@llamaindex/liteparse");
  },
  "pdf-parse": async () => {
    globalThis.DOMMatrix ??= DOMMatrix;
    globalThis.pdfjsWorker =
      await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
    return import("pdf-parse");
  },
  "office-text-extractor": async () => {
    const { extractSlides } =
      await import("../../../../packages/agents/src/host-modules/pptx.ts");
    return {
      getTextExtractor: () => ({
        extractText: async ({ type, input }) => {
          if (type !== "buffer" || !(input instanceof Uint8Array))
            throw new Error("Native presentation extraction requires bytes");
          return (
            (await extractSlides(input))
              .map((slide) => slide.text)
              .join("\n---\n") + "\n"
          );
        }
      })
    };
  },
  pptxgenjs: () => import("pptxgenjs"),
  fabric: async () => (await import("./sandbox-fabric.mjs")).loadFabric(),
  "tesseract.js": async () => ({
    recognize: async (bytes, language) => ({
      data: JSON.parse(globalThis.__host.context.ocr(bytes, language))
    })
  }),
  "@tensorflow/tfjs": async () => {
    const tf = await import("@tensorflow/tfjs");
    tf.setPlatform("native-guest", {
      fetch: (...args) => globalThis.fetch(...args),
      now: () => globalThis.performance?.now?.() ?? Date.now(),
      encode: (text, encoding) => {
        if (!["utf8", "utf-8"].includes(encoding))
          throw new Error("TensorFlow encoding must be UTF-8");
        return new TextEncoder().encode(text);
      },
      decode: (bytes, encoding) => new TextDecoder(encoding).decode(bytes),
      isTypedArray: (value) =>
        ArrayBuffer.isView(value) && !(value instanceof DataView)
    });
    return tf;
  },
  "@tensorflow-models/mobilenet": () => import("@tensorflow-models/mobilenet"),
  "@tensorflow-models/coco-ssd": () => import("@tensorflow-models/coco-ssd"),
  "@tensorflow-models/qna": () => import("@tensorflow-models/qna"),
  sharp: async () => ({ default: await loadSharp() }),
  "@napi-rs/canvas": loadCanvas,
  canvas: loadCanvas
};
export function installOptionalLibraries() {
  globalThis.navigator ??= {};
  globalThis.navigator.userAgent ??= "NodeTool/QuickJS";
  const platform = globalThis.__host?.process?.platform ?? "";
  globalThis.navigator.platform ??=
    { linux: "Linux", darwin: "Mac", win32: "Win32" }[platform] ?? platform;
  globalThis.Buffer ??= Buffer;
  globalThis.ReadableStream ??= ReadableStream;
  globalThis.WritableStream ??= WritableStream;
  globalThis.TransformStream ??= TransformStream;
  globalThis.console ??= Object.fromEntries(
    ["log", "info", "warn", "error", "debug"].map((level) => [
      level,
      (...args) =>
        globalThis.__host?.log(
          level === "log" ? "info" : level,
          args
            .map((value) =>
              typeof value === "string" ? value : JSON.stringify(value)
            )
            .join(" ")
            .slice(0, 10000)
        )
    ])
  );
  globalThis.__guestImports ??= Object.create(null);
  for (const [name, load] of Object.entries(loaders))
    globalThis.__guestImports[name] ??= load;
}
