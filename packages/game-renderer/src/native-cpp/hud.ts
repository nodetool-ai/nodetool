import type { NativeFrame } from "@nodetool-ai/protocol/native-game";

export const NATIVE_HUD_STYLE = {
  font: '14pt "Sans Serif", sans-serif', color: "rgb(244, 246, 250)",
  buttonBackground: "rgba(40, 46, 58, 0.941176)", buttonBorder: "1px solid rgb(155, 163, 178)",
  radius: "4px", horizontalPadding: "8px"
} as const;

function hudText(text: string, frame: NativeFrame): string {
  return text.replaceAll("{tick}", String(frame.tick)).replaceAll("{score}", String(frame.score)).replaceAll("{health}", String(frame.health));
}

export interface NativeHud {
  render(frame: NativeFrame): void;
  resize(width: number, height: number): void;
  hitTest(x: number, y: number): string | null;
  dispose(): void;
}

/** Native bounds are normalized against the presentation viewport. */
export function createNativeHud(options: {
  readonly container: HTMLElement;
  readonly onAction: (action: string, pressed: boolean) => void;
  readonly onCancel?: () => void;
}): NativeHud {
  const root = options.container.ownerDocument.createElement("div");
  root.style.position = "absolute";
  root.style.inset = "0";
  root.style.pointerEvents = "none";
  options.container.append(root);
  const elements = new Map<string, HTMLElement>();
  let widgets: NativeFrame["hud"] = [];
  let width = 1;
  let height = 1;
  let disposed = false;
  const actions = new Map<string, string>();
  const release = new Map<string, () => void>();
  return {
    render(frame) {
      if (disposed) { return; }
      widgets = frame.hud;
      const retained = new Set<string>();
      for (const widget of widgets) {
        retained.add(widget.id);
        let element = elements.get(widget.id);
        if (element && (element.tagName === "BUTTON") !== (widget.kind === "button")) {
          release.get(widget.id)?.(); element.remove(); elements.delete(widget.id); element = undefined;
        }
        if (!element) {
          element = root.ownerDocument.createElement(widget.kind === "button" ? "button" : "div");
          elements.set(widget.id, element); root.append(element);
          Object.assign(element.style, {
            font: NATIVE_HUD_STYLE.font, color: NATIVE_HUD_STYLE.color, boxSizing: "border-box",
            padding: `0 ${NATIVE_HUD_STYLE.horizontalPadding}`, display: "flex", alignItems: "center", textAlign: "left",
            background: widget.kind === "button" ? NATIVE_HUD_STYLE.buttonBackground : "transparent",
            border: widget.kind === "button" ? NATIVE_HUD_STYLE.buttonBorder : "none", borderRadius: NATIVE_HUD_STYLE.radius
          });
        }
        if (widget.kind === "button" && actions.get(widget.id) !== widget.action) {
          actions.set(widget.id, widget.action);
          release.get(widget.id)?.();
          let pressed = false;
          const setPressed = (value: boolean): void => {
            if (value !== pressed) { pressed = value; options.onAction(widget.action, value); }
          };
          element.onpointerdown = (event): void => { event.stopPropagation(); setPressed(true); };
          element.onpointerup = (): void => { setPressed(false); };
          element.onpointercancel = (): void => { setPressed(false); options.onCancel?.(); };
          element.onpointerleave = (): void => { setPressed(false); options.onCancel?.(); };
          element.onkeydown = (event): void => {
            if (event.key === " " || event.key === "Enter") { event.preventDefault(); setPressed(true); }
          };
          element.onkeyup = (event): void => {
            if (event.key === " " || event.key === "Enter") { event.preventDefault(); setPressed(false); }
          };
          element.onblur = (): void => { setPressed(false); options.onCancel?.(); };
          element.onclick = (event): void => {
            if (event.detail === 0) { setPressed(true); setPressed(false); }
          };
          element.style.pointerEvents = "auto";
          release.set(widget.id, () => setPressed(false));
        }
        const text = hudText(widget.text, frame);
        element.textContent = text;
        if (widget.kind === "button") { element.setAttribute("aria-label", text); }
        element.style.position = "absolute";
        element.style.left = `${widget.bounds[0] * 100}%`;
        element.style.top = `${widget.bounds[1] * 100}%`;
        element.style.width = `${widget.bounds[2] * 100}%`;
        element.style.height = `${widget.bounds[3] * 100}%`;
      }
      for (const [id, element] of elements) {
        if (!retained.has(id)) { release.get(id)?.(); release.delete(id); actions.delete(id); element.remove(); elements.delete(id); }
      }
    },
    resize(nextWidth, nextHeight) { width = Math.max(1, nextWidth); height = Math.max(1, nextHeight); },
    hitTest(x, y) {
      for (let index = widgets.length - 1; index >= 0; index--) {
        const widget = widgets[index];
        if (!widget || widget.kind !== "button") { continue; }
        const [left, top, w, h] = widget.bounds;
        if (x >= left * width && y >= top * height && x <= (left + w) * width && y <= (top + h) * height) { return widget.action; }
      }
      return null;
    },
    dispose() {
      if (disposed) { return; }
      disposed = true;
      for (const stop of release.values()) { stop(); }
      release.clear(); elements.clear(); widgets = []; root.remove();
    }
  };
}
