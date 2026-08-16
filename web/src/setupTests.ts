// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import "@testing-library/jest-dom";
import { installGlobal } from "./test-utils/doubles";

// Mock import.meta for Vite environment variables
Object.defineProperty(globalThis, "import", {
  value: {
    meta: {
      env: {
        MODE: "test",
        VITE_API_URL: "http://localhost:7777",
        VITE_SUPABASE_URL: "https://test.supabase.co",
        VITE_SUPABASE_ANON_KEY: "test-anon-key"
      }
    }
  }
});

// Mock TextEncoder/TextDecoder for msgpack
import { TextEncoder, TextDecoder } from "util";
import { isFunction } from "./utils/typePredicates";

installGlobal("TextEncoder", TextEncoder);
installGlobal("TextDecoder", TextDecoder);

// Mock global.btoa and atob for base64 operations
global.btoa = (str: string) => Buffer.from(str, "binary").toString("base64");
global.atob = (str: string) => Buffer.from(str, "base64").toString("binary");

// jsdom does not implement ResizeObserver; stub it so React components that
// observe their container (e.g. <TransformGizmo />) can mount in tests.
if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === "undefined") {
  class StubResizeObserver {
    observe = (): void => {};
    unobserve = (): void => {};
    disconnect = (): void => {};
  }
  installGlobal("ResizeObserver", StubResizeObserver);
}

// jsdom does not implement pointer capture; stub it with per-element tracking so
// components using setPointerCapture (e.g. <OnScreenKeyboard />) work in tests.
if (
  typeof Element !== "undefined" &&
  !isFunction(Element.prototype.setPointerCapture)
) {
  const captured = new WeakMap<Element, Set<number>>();
  Element.prototype.setPointerCapture = function (pointerId: number): void {
    let ids = captured.get(this);
    if (!ids) {
      ids = new Set();
      captured.set(this, ids);
    }
    ids.add(pointerId);
  };
  Element.prototype.releasePointerCapture = function (pointerId: number): void {
    captured.get(this)?.delete(pointerId);
  };
  Element.prototype.hasPointerCapture = function (pointerId: number): boolean {
    return captured.get(this)?.has(pointerId) ?? false;
  };
}

