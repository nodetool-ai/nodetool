// web/src/components/chat/composer/__tests__/ComposerSlot.test.tsx
import React from "react";
import "@testing-library/jest-dom";
import { render, screen, act } from "@testing-library/react";
import {
  ComposerSlotProvider,
  useComposerSlotContext
} from "../composerSlotContext";
import ComposerSlot from "../ComposerSlot";

const send = jest.fn();

function ActiveReadout() {
  const { activeSlot } = useComposerSlotContext();
  return (
    <span data-testid="active">{activeSlot ? "registered" : "none"}</span>
  );
}

describe("ComposerSlot", () => {
  it("registers on mount and clears on unmount", () => {
    const { unmount, rerender } = render(
      <ComposerSlotProvider>
        <ComposerSlot onSend={send} className="slot" />
        <ActiveReadout />
      </ComposerSlotProvider>
    );
    expect(screen.getByTestId("active")).toHaveTextContent("registered");

    rerender(
      <ComposerSlotProvider>
        <ActiveReadout />
      </ComposerSlotProvider>
    );
    expect(screen.getByTestId("active")).toHaveTextContent("none");
    unmount();
  });

  it("reserves vertical space equal to the composer height", () => {
    function HeightControl() {
      const { setComposerHeight } = useComposerSlotContext();
      return (
        <button onClick={() => setComposerHeight(56)}>set-height</button>
      );
    }

    render(
      <ComposerSlotProvider>
        <ComposerSlot onSend={send} className="slot" />
        <HeightControl />
      </ComposerSlotProvider>
    );
    const slot = document.querySelector("[data-composer-slot]") as HTMLElement;
    expect(slot).toBeInTheDocument();
    // Collapses (no height style) until a composer reports its height.
    expect(slot.style.height).toBe("");
    act(() => { screen.getByText("set-height").click(); });
    expect(slot.style.height).toBe("56px");
  });
});
