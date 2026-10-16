/** The sampler operations driven by physical mouse input. */
export interface GameMouseInputSink {
  mouseDown(button: number): void;
  mouseUp(button: number): void;
  look(x: number, y: number): void;
  release(): void;
}

export interface GameMouseInputOptions {
  readonly active: () => boolean;
  readonly lookEnabled?: () => boolean;
  readonly onLockFailure?: () => void;
}

// MouseEvent.buttons orders right before middle, unlike MouseEvent.button.
const MOUSE_BUTTONS = [[1, 0], [4, 1], [2, 2], [8, 3], [16, 4]] as const;

/**
 * Samples complete mouse button masks, including chord transitions delivered only by pointermove.
 * Actions do not depend on pointer lock. Lock is only an optional way to receive mouse look.
 */
export function attachGameMouseInput(canvas: HTMLCanvasElement, input: GameMouseInputSink,
  options: GameMouseInputOptions): () => void {
  let buttons = 0;
  let tracking = false;
  let hudOwned = false;
  const locked = (): boolean => document.pointerLockElement === canvas;
  const reconcile = (next: number): void => {
    for (const [bit, button] of MOUSE_BUTTONS) {
      if ((buttons & bit) !== 0 && (next & bit) === 0) { input.mouseUp(button); }
    }
    for (const [bit, button] of MOUSE_BUTTONS) {
      if ((buttons & bit) === 0 && (next & bit) !== 0) { input.mouseDown(button); }
    }
    buttons = next;
  };
  const release = (): void => {
    reconcile(0);
    input.release();
    tracking = false;
    hudOwned = false;
  };
  const requestLook = (): void => {
    if (!options.lookEnabled?.() || locked()) { return; }
    if (typeof canvas.requestPointerLock !== "function") { options.onLockFailure?.(); return; }
    try {
      // Older browsers return void, while current browsers may reject a Promise.
      const result = canvas.requestPointerLock();
      if (result && typeof result.catch === "function") { void result.catch(() => options.onLockFailure?.()); }
    } catch {
      options.onLockFailure?.();
    }
  };
  const down = (event: PointerEvent): void => {
    if (event.pointerType === "touch" || event.pointerType === "pen") { return; }
    if (!options.active()) { release(); return; }
    canvas.focus();
    tracking = true;
    hudOwned = event.defaultPrevented;
    if (hudOwned) { reconcile(0); return; }
    // Deliver buttons before optional browser operations, including ones that can throw.
    reconcile(event.buttons);
    if (!locked() && typeof canvas.setPointerCapture === "function") {
      try { canvas.setPointerCapture(event.pointerId); } catch {
        // A released pointer can race this request. Window listeners still observe its release.
      }
    }
    requestLook();
  };
  const move = (event: PointerEvent): void => {
    if (event.pointerType === "touch" || event.pointerType === "pen" || (!tracking && !locked())) { return; }
    if (!options.active()) { release(); return; }
    if (hudOwned) { return; }
    if (tracking) { reconcile(event.buttons); }
    if (options.lookEnabled?.() && (event.buttons !== 0 || locked())) {
      input.look(event.movementX, event.movementY);
    }
    if (event.buttons === 0) { tracking = false; }
  };
  const up = (event: PointerEvent): void => {
    if (event.pointerType === "touch" || event.pointerType === "pen" || !tracking) { return; }
    if (!options.active()) { release(); return; }
    if (!hudOwned) { reconcile(event.buttons); }
    if (event.buttons === 0) { tracking = false; hudOwned = false; }
  };
  const lockChange = (): void => { if (!locked()) { release(); } };
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("blur", release);
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", release);
  window.addEventListener("blur", release);
  document.addEventListener("pointerlockchange", lockChange);
  return () => {
    canvas.removeEventListener("pointerdown", down);
    canvas.removeEventListener("blur", release);
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", release);
    window.removeEventListener("blur", release);
    document.removeEventListener("pointerlockchange", lockChange);
    release();
  };
}
