import React from "react";
import { act, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { MobileBottomSheet } from "../MobileBottomSheet";
import { ScrollArea } from "../ScrollArea";

const makeScrollable = (element: HTMLElement) => {
  Object.defineProperty(element, "scrollHeight", { value: 1000 });
  Object.defineProperty(element, "clientHeight", { value: 200 });
  Object.defineProperty(element, "clientWidth", { value: 300 });
};

const touch = (target: Element, clientY: number) =>
  ({ identifier: 0, target, clientX: 100, clientY, pageX: 100, pageY: clientY }) as unknown as Touch;

// Dispatches an upward swipe (scrolling the list down) and returns whether
// the drawer blocked native scrolling on any touchmove.
const swipeUp = (target: Element) => {
  const dispatch = (event: TouchEvent) => {
    act(() => {
      target.dispatchEvent(event);
    });
  };
  dispatch(
    new TouchEvent("touchstart", {
      bubbles: true,
      cancelable: true,
      touches: [touch(target, 500)]
    })
  );
  let prevented = false;
  for (const y of [490, 470, 440]) {
    const move = new TouchEvent("touchmove", {
      bubbles: true,
      cancelable: true,
      touches: [touch(target, y)]
    });
    dispatch(move);
    prevented = prevented || move.defaultPrevented;
  }
  dispatch(
    new TouchEvent("touchend", {
      bubbles: true,
      cancelable: true,
      changedTouches: [touch(target, 440)]
    })
  );
  return prevented;
};

const renderSheet = (content: React.ReactNode) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <MobileBottomSheet open onClose={jest.fn()} title="Documents">
        {content}
      </MobileBottomSheet>
    </ThemeProvider>
  );

describe("MobileBottomSheet", () => {
  it("lets a ScrollArea inside the sheet scroll natively on touch", () => {
    renderSheet(
      <ScrollArea data-testid="list" thin>
        <div data-testid="row">Row</div>
      </ScrollArea>
    );
    makeScrollable(screen.getByTestId("list"));

    expect(swipeUp(screen.getByTestId("row"))).toBe(false);
  });

  it("still claims swipes that start outside scrollable content", () => {
    renderSheet(<div data-testid="static">Static</div>);

    expect(swipeUp(screen.getByTestId("static"))).toBe(true);
  });
});
