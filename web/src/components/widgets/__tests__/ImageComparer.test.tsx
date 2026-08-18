import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import ImageComparer from "../ImageComparer";
import mockTheme from "../../../__mocks__/themeMock";

const renderComparer = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ImageComparer imageA="a.png" imageB="b.png" labelA="A" labelB="B" />
    </ThemeProvider>
  );

const container = () =>
  document.querySelector(".comparer-container") as HTMLElement;

// jsdom has no PointerEvent, and fireEvent drops the properties it cannot set
// on a plain Event, so build the event by hand. React derives enter/leave from
// pointerover/pointerout.
const POINTER_EVENT_NAME = {
  enter: "pointerover",
  leave: "pointerout",
  move: "pointermove"
} as const;

const firePointer = (
  el: HTMLElement,
  kind: keyof typeof POINTER_EVENT_NAME,
  init: { pointerType: string; clientX?: number; clientY?: number }
) => {
  const event = new MouseEvent(POINTER_EVENT_NAME[kind], {
    bubbles: true,
    cancelable: true,
    clientX: init.clientX ?? 0,
    clientY: init.clientY ?? 0
  });
  Object.defineProperty(event, "pointerType", { value: init.pointerType });
  fireEvent(el, event);
};

// jsdom reports a zero-sized box; give the container a real one so the
// percentage math is meaningful.
const stubRect = (el: HTMLElement) => {
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 200, height: 100 }) as DOMRect;
};

describe("ImageComparer", () => {
  it("moves the divider for a touch pointer", () => {
    renderComparer();
    const el = container();
    stubRect(el);

    firePointer(el, "enter", { pointerType: "touch" });
    firePointer(el, "move", { pointerType: "touch", clientX: 50, clientY: 50 });

    const divider = document.querySelector(".divider-line") as HTMLElement;
    expect(divider).toBeInTheDocument();
    expect(divider.style.left).toBe("25%");
  });

  it("keeps the dragged position after a touch lifts", () => {
    renderComparer();
    const el = container();
    stubRect(el);

    firePointer(el, "enter", { pointerType: "touch" });
    firePointer(el, "move", { pointerType: "touch", clientX: 50, clientY: 50 });
    firePointer(el, "leave", { pointerType: "touch" });

    firePointer(el, "enter", { pointerType: "touch" });
    const divider = document.querySelector(".divider-line") as HTMLElement;
    expect(divider.style.left).toBe("25%");
  });

  it("recenters when a mouse leaves", () => {
    renderComparer();
    const el = container();
    stubRect(el);

    firePointer(el, "enter", { pointerType: "mouse" });
    firePointer(el, "move", { pointerType: "mouse", clientX: 50, clientY: 50 });
    firePointer(el, "leave", { pointerType: "mouse" });

    firePointer(el, "enter", { pointerType: "mouse" });
    const divider = document.querySelector(".divider-line") as HTMLElement;
    expect(divider.style.left).toBe("50%");
  });

  it("switches the drag axis with the mode toggle", () => {
    renderComparer();
    const el = container();
    stubRect(el);

    fireEvent.click(screen.getByRole("button", { name: /switch to vertical/i }));

    firePointer(el, "enter", { pointerType: "touch" });
    firePointer(el, "move", { pointerType: "touch", clientX: 50, clientY: 25 });

    const divider = document.querySelector(".divider-line") as HTMLElement;
    expect(divider.style.top).toBe("25%");
  });
});
