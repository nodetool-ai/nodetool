import React from "react";
import { render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/dom";

import OnScreenKeyboard from "../OnScreenKeyboard";

const layout = { default: ["a b"] };

const getKey = (button: string): HTMLElement =>
  screen.getByText(button).closest(".hg-button") as HTMLElement;

describe("OnScreenKeyboard", () => {
  it("presses and releases a key on a normal pointer interaction", () => {
    const onKeyPress = jest.fn();
    const onKeyReleased = jest.fn();
    render(
      <OnScreenKeyboard
        layout={layout}
        layoutName="default"
        onKeyPress={onKeyPress}
        onKeyReleased={onKeyReleased}
      />
    );

    const key = getKey("a");
    fireEvent.pointerDown(key, { pointerId: 1 });
    fireEvent.pointerUp(key, { pointerId: 1 });

    expect(onKeyPress).toHaveBeenCalledWith("a");
    expect(onKeyReleased).toHaveBeenCalledWith("a");
  });

  it("captures the pointer on press so the release always returns to the key", () => {
    const onKeyPress = jest.fn();
    const onKeyReleased = jest.fn();
    render(
      <OnScreenKeyboard
        layout={layout}
        layoutName="default"
        onKeyPress={onKeyPress}
        onKeyReleased={onKeyReleased}
      />
    );

    const key = getKey("a");
    const setCapture = jest.spyOn(key, "setPointerCapture");
    const releaseCapture = jest.spyOn(key, "releasePointerCapture");

    // Press "a": the key captures the pointer, so a release anywhere on the
    // page is routed back here — no drag-off can leave the key stuck pressed.
    fireEvent.pointerDown(key, { pointerId: 7 });
    expect(onKeyPress).toHaveBeenCalledWith("a");
    expect(setCapture).toHaveBeenCalledTimes(1);
    const capturedId = setCapture.mock.calls[0][0];
    expect(key.hasPointerCapture(capturedId)).toBe(true);

    // Release: capture is dropped and the key is released exactly once.
    fireEvent.pointerUp(key, { pointerId: 7 });
    expect(releaseCapture).toHaveBeenCalledWith(capturedId);
    expect(onKeyReleased).toHaveBeenCalledTimes(1);
    expect(onKeyReleased).toHaveBeenCalledWith("a");
    expect(key.hasPointerCapture(capturedId)).toBe(false);
  });

  it("releases the key when the pointer interaction is cancelled", () => {
    const onKeyReleased = jest.fn();
    render(
      <OnScreenKeyboard
        layout={layout}
        layoutName="default"
        onKeyReleased={onKeyReleased}
      />
    );

    const key = getKey("a");
    fireEvent.pointerDown(key, { pointerId: 1 });
    fireEvent.pointerCancel(key, { pointerId: 1 });

    expect(onKeyReleased).toHaveBeenCalledWith("a");
    expect(key.hasPointerCapture(1)).toBe(false);
  });
});
