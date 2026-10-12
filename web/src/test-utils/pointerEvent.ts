import { installGlobal } from "./doubles";

/** Polyfill PointerEvent for jsdom, which does not implement it. */
export function installPointerEvent(): void {
  if (typeof window !== "undefined" && !window.PointerEvent) {
    installGlobal(
      "PointerEvent",
      class PointerEvent extends MouseEvent {
        readonly pointerId: number;
        readonly pointerType: string;
        readonly isPrimary: boolean;

        constructor(
          type: string,
          params: PointerEventInit & MouseEventInit = {}
        ) {
          super(type, params);
          this.pointerId = params.pointerId ?? 0;
          this.pointerType = params.pointerType ?? "";
          this.isPrimary = params.isPrimary ?? false;
        }
      }
    );
  }
  // jsdom does not implement pointer capture.
  HTMLElement.prototype.setPointerCapture = jest.fn();
  HTMLElement.prototype.releasePointerCapture = jest.fn();
}
