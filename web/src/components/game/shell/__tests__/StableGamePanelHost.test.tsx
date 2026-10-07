import { createRef } from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../../__mocks__/themeMock";
import { StableGamePanelHost, type GamePanelFocusSnapshot } from "../StableGamePanelHost";

it("detaches a truly absent slot, focuses a visible fallback, and reattaches the same inert-preserved input", async () => {
  const user = userEvent.setup();
  const slot = document.createElement("section");
  const replacement = document.createElement("section");
  document.body.append(slot, replacement);
  const snapshot = createRef<GamePanelFocusSnapshot>();
  const fallback = createRef<HTMLButtonElement>();
  const view = (target: HTMLElement | null) => <ThemeProvider theme={mockTheme}>
    <button ref={fallback}>Visible layout fallback</button>
    <StableGamePanelHost id="scripts" slot={slot} resolveSlot={() => target} active
      focusSnapshot={snapshot} fallbackFocus={() => fallback.current}>
      <textarea aria-label="Preserved script input" defaultValue="draft" />
    </StableGamePanelHost>
  </ThemeProvider>;
  const rendered = await act(async () => render(view(slot)));
  try {
    const input = screen.getByRole("textbox", { name: "Preserved script input" });
    const host = input.closest<HTMLElement>("[data-game-panel-host]");
    if (!host) { throw new Error("Actual stable host was not attached"); }
    await user.click(input);
    await user.type(input, " edit");
    await act(async () => rendered.rerender(view(null)));
    expect(host.isConnected).toBe(false);
    expect(host.hidden).toBe(true);
    expect(host.inert).toBe(true);
    expect(fallback.current).toHaveFocus();
    await act(async () => rendered.rerender(view(replacement)));
    expect(screen.getByRole("textbox", { name: "Preserved script input" })).toBe(input);
    expect(input).toHaveValue("draft edit");
    expect(host.parentElement).toBe(replacement);
    expect(host.hidden).toBe(false);
    expect(host.inert).toBe(false);
    expect(fallback.current).toHaveFocus();
    await act(async () => rendered.unmount());
    expect(host.isConnected).toBe(false);
    expect(replacement.childElementCount).toBe(0);
  } finally {
    await act(async () => rendered.unmount());
    slot.remove();
    replacement.remove();
  }
});

it("releases a hidden viewport's pointer lock and does not release another panel's lock", async () => {
  const slot = document.createElement("section");
  document.body.appendChild(slot);
  const snapshot = createRef<GamePanelFocusSnapshot>();
  const fallback = createRef<HTMLButtonElement>();
  let locked: Element | null = null;
  const lockDescriptor = Object.getOwnPropertyDescriptor(document, "pointerLockElement");
  const exitDescriptor = Object.getOwnPropertyDescriptor(document, "exitPointerLock");
  const exit = jest.fn(() => { locked = null; });
  // Only the pointer-lock API is adapted because JSDOM cannot acquire a browser pointer lock.
  Object.defineProperty(document, "pointerLockElement", { configurable: true, get: () => locked });
  Object.defineProperty(document, "exitPointerLock", { configurable: true, value: exit });
  const view = (active: boolean, targetSlot: HTMLElement | null = slot) => <ThemeProvider theme={mockTheme}>
    <button ref={fallback}>Other panel</button>
    <StableGamePanelHost id="viewport" slot={targetSlot} active={active} focusSnapshot={snapshot} fallbackFocus={() => fallback.current}>
      <canvas aria-label="Locked viewport" tabIndex={0} />
    </StableGamePanelHost>
  </ThemeProvider>;
  const rendered = await act(async () => render(view(true)));
  try {
    locked = screen.getByLabelText("Locked viewport");
    await act(async () => rendered.rerender(view(false)));
    expect(exit).toHaveBeenCalledTimes(1);
    expect(locked).toBeNull();
    await act(async () => rendered.rerender(view(true)));
    locked = fallback.current;
    await act(async () => rendered.rerender(view(false)));
    expect(exit).toHaveBeenCalledTimes(1);
    expect(locked).toBe(fallback.current);
    await act(async () => rendered.rerender(view(true)));
    locked = screen.getByLabelText("Locked viewport");
    await act(async () => rendered.rerender(view(true, null)));
    expect(exit).toHaveBeenCalledTimes(2);
    expect(locked).toBeNull();
  } finally {
    await act(async () => rendered.unmount());
    slot.remove();
    if (lockDescriptor) { Object.defineProperty(document, "pointerLockElement", lockDescriptor); }
    else { Reflect.deleteProperty(document, "pointerLockElement"); }
    if (exitDescriptor) { Object.defineProperty(document, "exitPointerLock", exitDescriptor); }
    else { Reflect.deleteProperty(document, "exitPointerLock"); }
  }
});
