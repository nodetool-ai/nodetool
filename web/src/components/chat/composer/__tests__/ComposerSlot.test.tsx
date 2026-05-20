// web/src/components/chat/composer/__tests__/ComposerSlot.test.tsx
import React from "react";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
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
    render(
      <ComposerSlotProvider>
        <ComposerSlot onSend={send} className="slot" />
      </ComposerSlotProvider>
    );
    const slot = document.querySelector("[data-composer-slot]") as HTMLElement;
    expect(slot).toBeTruthy();
    expect(slot.getAttribute("data-composer-slot")).toBe("");
  });
});
