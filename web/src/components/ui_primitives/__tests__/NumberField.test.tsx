import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import { NumberField } from "../NumberField";
import mockTheme from "../../../__mocks__/themeMock";

const renderField = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>);

// jsdom has no PointerEvent: fireEvent would drop pointerId.
if (!window.PointerEvent) {
  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: class PointerEvent extends MouseEvent {
      readonly pointerId: number;
      constructor(type: string, params: PointerEventInit = {}) {
        super(type, params);
        this.pointerId = params.pointerId ?? 0;
      }
    }
  });
}

beforeAll(() => {
  HTMLElement.prototype.setPointerCapture = jest.fn();
});

describe("NumberField", () => {
  it("passes min, max and step to the native input", () => {
    renderField(<NumberField label="Width" value="10" min={1} max={99} step={2} onChange={jest.fn()} />);
    const field = screen.getByRole("spinbutton", { name: "Width" });
    expect(field).toHaveAttribute("min", "1");
    expect(field).toHaveAttribute("max", "99");
    expect(field).toHaveAttribute("step", "2");
  });

  it("reports typed text through onChange and onValueChange", () => {
    const onChange = jest.fn();
    const onValueChange = jest.fn();
    renderField(<NumberField label="FPS" value="24" onChange={onChange} onValueChange={onValueChange} />);
    fireEvent.change(screen.getByRole("spinbutton", { name: "FPS" }), { target: { value: "30" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith("30");
  });

  it("renders the unit suffix and an aria-label", () => {
    renderField(<NumberField value="50" unit="%" ariaLabel="Alpha" onChange={jest.fn()} />);
    expect(screen.getByText("%")).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Alpha" })).toBeInTheDocument();
  });

  it("scrubs horizontally with clamping and does not scrub when focused", () => {
    const onValueChange = jest.fn();
    renderField(
      <NumberField label="Size" value="10" min={0} max={12} step={1} scrub onValueChange={onValueChange} />
    );
    const field = screen.getByRole("spinbutton", { name: "Size" });
    const root = field.closest(".MuiTextField-root") as HTMLElement;
    fireEvent.pointerDown(root, { clientX: 0, button: 0, pointerId: 1 });
    fireEvent.pointerMove(root, { clientX: 5, pointerId: 1 });
    expect(onValueChange).toHaveBeenLastCalledWith("12");
    fireEvent.pointerUp(root, { pointerId: 1 });

    onValueChange.mockClear();
    fireEvent.focus(field);
    fireEvent.pointerDown(root, { clientX: 0, button: 0, pointerId: 2 });
    fireEvent.pointerMove(root, { clientX: 5, pointerId: 2 });
    expect(onValueChange).not.toHaveBeenCalled();
  });
});
