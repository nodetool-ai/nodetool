/**
 * Shared pointer state that keeps hover tooltips from lingering.
 *
 * A pointer press closes every open tooltip and stops hover tooltips from
 * opening until the pointer actually moves. Without it, a tooltip stays open
 * after its trigger was clicked, after a context menu or panel closed under a
 * resting pointer, or appears on whatever element a closing popover leaves
 * under the cursor. Keyboard focus and touch long-press still open tooltips.
 */

/** Pointer travel (px) after a press that counts as a deliberate move. */
const MOVE_TOLERANCE_PX = 4;

let installed = false;
let suppressed = false;
let pressX = 0;
let pressY = 0;
let pressTarget: EventTarget | null = null;
const closers = new Set<(target: EventTarget | null) => void>();

const isInsideTooltip = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest(".MuiTooltip-popper") !== null;

const isDisabledControl = (target: EventTarget | null): boolean =>
  target instanceof Element &&
  target.closest('[aria-disabled="true"], :disabled') !== null;

const handlePointerDown = (event: PointerEvent): void => {
  // Pressing inside an interactive tooltip (a link, selectable text) keeps it.
  // Pressing a disabled control keeps its tooltip, which says why it is off.
  if (isInsideTooltip(event.target) || isDisabledControl(event.target)) {
    return;
  }
  suppressed = true;
  pressX = event.clientX;
  pressY = event.clientY;
  pressTarget = event.target;
  closers.forEach((close) => close(event.target));
};

const handlePointerMove = (event: PointerEvent): void => {
  // Moving onto another element, or travelling past the tolerance, is a
  // deliberate move. A popover that closes under a resting pointer sends no
  // pointermove at all, so its stray mouseover stays suppressed.
  if (
    suppressed &&
    (event.target !== pressTarget ||
      Math.hypot(event.clientX - pressX, event.clientY - pressY) >
        MOVE_TOLERANCE_PX)
  ) {
    suppressed = false;
  }
};

const install = (): void => {
  if (installed || typeof document === "undefined") {
    return;
  }
  installed = true;
  document.addEventListener("pointerdown", handlePointerDown, true);
  document.addEventListener("pointermove", handlePointerMove, true);
};

// Listen from load: the press that matters often comes before any tooltip
// has opened, such as picking from a menu that then closes over a trigger.
install();

/**
 * Whether a tooltip may open for this event. Focus (keyboard) and touch
 * long-press always may. Hover may not until the pointer moves after a press.
 */
export const canOpenTooltip = (event: { type: string }): boolean => {
  if (event.type === "focus" || event.type.startsWith("touch")) {
    return true;
  }
  return !suppressed;
};

/** Close the tooltip on the next pointer press. Returns the unsubscribe. */
export const closeTooltipOnPointerDown = (
  close: (target: EventTarget | null) => void
): (() => void) => {
  closers.add(close);
  return () => {
    closers.delete(close);
  };
};

/** Test helper: forget the last press. */
export const resetTooltipPointerGate = (): void => {
  suppressed = false;
  pressTarget = null;
};
