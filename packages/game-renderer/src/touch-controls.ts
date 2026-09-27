const DIRECTIONS = ["left", "right", "up", "down"] as const;
// sin(22.5°): an axis turns on once the stick leans past the edge of its 45° sector, which gives 8-way input.
const AXIS_THRESHOLD = 0.38;

/** Maps a stick offset in screen pixels (y grows downward) to the direction actions it presses. */
export function stickActions(dx: number, dy: number, deadZone: number): string[] {
  const length = Math.hypot(dx, dy);
  if (!(length > deadZone)) {
    return [];
  }
  const x = dx / length;
  const y = -dy / length;
  const actions: string[] = [];
  if (x < -AXIS_THRESHOLD) actions.push("left");
  if (x > AXIS_THRESHOLD) actions.push("right");
  if (y > AXIS_THRESHOLD) actions.push("up");
  if (y < -AXIS_THRESHOLD) actions.push("down");
  return actions;
}

/** Splits a game's input actions into the stick's directions and one button per other action. */
export function touchLayout(inputActions: readonly string[]): { stick: string[]; buttons: string[] } {
  const stick = DIRECTIONS.filter((action) => inputActions.includes(action));
  return { stick, buttons: inputActions.filter((action) => !stick.includes(action as (typeof DIRECTIONS)[number])) };
}

export interface TouchControlsOptions {
  readonly inputActions: readonly string[];
  /** Called with the full set of actions touch currently holds. */
  readonly onChange: (pressed: ReadonlySet<string>) => void;
}

/**
 * A floating stick on the left half of the screen and action buttons on the right.
 * The stick appears where the thumb lands, so it works for any hand position.
 */
export function mountTouchControls(root: HTMLElement, options: TouchControlsOptions): () => void {
  const layout = touchLayout(options.inputActions);
  const held = new Map<string, Set<string>>();
  const emit = (): void => {
    const pressed = new Set<string>();
    for (const actions of held.values()) actions.forEach((action) => pressed.add(action));
    options.onChange(pressed);
  };
  const cleanups: Array<() => void> = [];
  const listen = <K extends keyof HTMLElementEventMap>(target: HTMLElement, type: K, handler: (event: HTMLElementEventMap[K]) => void): void => {
    target.addEventListener(type, handler, { passive: false });
    cleanups.push(() => target.removeEventListener(type, handler));
  };

  if (layout.stick.length > 0) {
    const zone = document.createElement("div");
    zone.className = "touch-stick-zone";
    const base = document.createElement("div");
    base.className = "touch-stick";
    const knob = document.createElement("div");
    knob.className = "touch-knob";
    base.append(knob);
    zone.append(base);
    root.append(zone);
    let pointerId: number | undefined;
    let originX = 0;
    let originY = 0;
    const radius = (): number => base.offsetWidth / 2 || 56;
    const move = (event: PointerEvent): void => {
      const limit = radius();
      let dx = event.clientX - originX;
      let dy = event.clientY - originY;
      const length = Math.hypot(dx, dy);
      if (length > limit) {
        dx = (dx / length) * limit;
        dy = (dy / length) * limit;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      held.set("stick", new Set(stickActions(dx, dy, limit * 0.25).filter((action) => layout.stick.includes(action as never))));
      emit();
    };
    const release = (event: PointerEvent): void => {
      if (event.pointerId !== pointerId) return;
      pointerId = undefined;
      base.classList.remove("active");
      knob.style.transform = "";
      held.delete("stick");
      emit();
    };
    listen(zone, "pointerdown", (event) => {
      event.preventDefault();
      if (pointerId !== undefined) return;
      pointerId = event.pointerId;
      zone.setPointerCapture(event.pointerId);
      originX = event.clientX;
      originY = event.clientY;
      const bounds = zone.getBoundingClientRect();
      base.style.left = `${originX - bounds.left}px`;
      base.style.top = `${originY - bounds.top}px`;
      base.classList.add("active");
      move(event);
    });
    listen(zone, "pointermove", (event) => {
      if (event.pointerId === pointerId) move(event);
    });
    listen(zone, "pointerup", release);
    listen(zone, "pointercancel", release);
  }

  const buttons = document.createElement("div");
  buttons.className = "touch-buttons";
  for (const action of layout.buttons) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "touch-button";
    button.textContent = action.toUpperCase();
    button.setAttribute("aria-label", action);
    const key = `button:${action}`;
    const up = (): void => {
      button.classList.remove("active");
      held.delete(key);
      emit();
    };
    listen(button, "pointerdown", (event) => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      button.classList.add("active");
      held.set(key, new Set([action]));
      emit();
    });
    listen(button, "pointerup", up);
    listen(button, "pointercancel", up);
    listen(button, "contextmenu", (event) => event.preventDefault());
    buttons.append(button);
  }
  root.append(buttons);
  return () => {
    cleanups.forEach((cleanup) => cleanup());
    root.replaceChildren();
    held.clear();
  };
}
