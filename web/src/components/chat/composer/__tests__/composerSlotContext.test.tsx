// web/src/components/chat/composer/__tests__/composerSlotContext.test.tsx
import React, { StrictMode } from "react";
import "@testing-library/jest-dom";
import { render, screen, act } from "@testing-library/react";
import {
  ComposerSlotProvider,
  useComposerSlotContext
} from "../composerSlotContext";
import ComposerSlot from "../ComposerSlot";

const noopSend = jest.fn();

function Probe() {
  const { activeSlot, registerSlot, unregisterSlot } =
    useComposerSlotContext();
  return (
    <div>
      <span data-testid="active">{activeSlot ? activeSlot.id : "none"}</span>
      <button
        onClick={() => {
          const el = document.createElement("div");
          el.id = "slot-a";
          registerSlot(el, noopSend);
          (window as any).__slotA = el;
        }}
      >
        register-a
      </button>
      <button onClick={() => unregisterSlot((window as any).__slotA)}>
        unregister-a
      </button>
    </div>
  );
}

describe("composerSlotContext", () => {
  it("tracks the active slot and clears only when the active element unregisters", () => {
    render(
      <ComposerSlotProvider>
        <Probe />
      </ComposerSlotProvider>
    );

    expect(screen.getByTestId("active")).toHaveTextContent("none");

    act(() => {
      screen.getByText("register-a").click();
    });
    expect(screen.getByTestId("active")).toHaveTextContent("slot-a");

    act(() => {
      screen.getByText("unregister-a").click();
    });
    expect(screen.getByTestId("active")).toHaveTextContent("none");
  });

  it("ignores unregister of a non-active element", () => {
    render(
      <ComposerSlotProvider>
        <Probe />
      </ComposerSlotProvider>
    );
    act(() => {
      screen.getByText("register-a").click();
    });
    act(() => {
      const other = document.createElement("div");
      const realA = (window as any).__slotA;
      (window as any).__slotA = other;
      screen.getByText("unregister-a").click();
      (window as any).__slotA = realA;
    });
    expect(screen.getByTestId("active")).toHaveTextContent("slot-a");
  });

  // Regression: under StrictMode, ComposerSlot mounts effect → cleanup → effect
  // (register → unregister → register). activeSlot and activeSend must stay
  // consistent through that cycle — a visible slot must always have a working
  // send handler.
  it("keeps activeSend consistent with activeSlot under StrictMode remount", () => {
    const sendSpy = jest.fn();

    function Consumer() {
      const { activeSlot, activeSend } = useComposerSlotContext();
      return (
        <button
          data-testid="invoke"
          data-has-slot={activeSlot ? "yes" : "no"}
          onClick={() =>
            activeSend?.([{ type: "text", text: "x" }], "x", false)
          }
        >
          invoke
        </button>
      );
    }

    render(
      <StrictMode>
        <ComposerSlotProvider>
          <ComposerSlot onSend={sendSpy} />
          <Consumer />
        </ComposerSlotProvider>
      </StrictMode>
    );

    const btn = screen.getByTestId("invoke");
    // The slot is registered, so the composer would be visible...
    expect(btn.getAttribute("data-has-slot")).toBe("yes");
    // ...and its send handler must actually fire.
    act(() => {
      btn.click();
    });
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });
});
