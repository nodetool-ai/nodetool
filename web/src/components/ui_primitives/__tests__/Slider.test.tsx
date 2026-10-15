import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { Slider } from "../Slider";
import { NodeSlider } from "../NodeSlider";

const wrap = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>);

describe("Slider", () => {
  it("renders a track-only slider by default", () => {
    wrap(<Slider aria-label="Amount" value={20} onChange={() => {}} />);
    expect(screen.getByRole("slider", { name: "Amount" })).toBeInTheDocument();
    expect(screen.queryByText("20%")).toBeNull();
  });

  it("row layout renders label, track and value readout", () => {
    wrap(
      <Slider
        layout="row"
        label="Opacity"
        display="80%"
        aria-label="Opacity"
        value={80}
        onChange={() => {}}
      />
    );
    expect(screen.getByText("Opacity")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Opacity" })).toBeInTheDocument();
  });

  it("forwards onChange to MUI unchanged", () => {
    const onChange = jest.fn();
    wrap(<Slider aria-label="Amount" value={20} onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][1]).toBe(21);
  });

  it("double-click resets to origin through onReset", () => {
    const onReset = jest.fn();
    const { container } = wrap(
      <Slider value={40} min={-100} max={100} origin={0} onReset={onReset} onChange={() => {}} />
    );
    fireEvent.doubleClick(container.querySelector(".MuiSlider-root")!);
    expect(onReset).toHaveBeenCalledWith(0);
  });

  it("double-click resets via onChange when no onReset is given", () => {
    const onChange = jest.fn();
    const { container } = wrap(
      <Slider value={40} resetValue={100} onChange={onChange} />
    );
    fireEvent.doubleClick(container.querySelector(".MuiSlider-root")!);
    expect(onChange.mock.calls[0][1]).toBe(100);
  });

  it("does not reset when disabled or without a target", () => {
    const onChange = jest.fn();
    const { container } = wrap(<Slider value={40} onChange={onChange} />);
    fireEvent.doubleClick(container.querySelector(".MuiSlider-root")!);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("sets bipolar fill vars from origin and value", () => {
    const { container } = wrap(
      <Slider value={50} min={-100} max={100} origin={0} onChange={() => {}} />
    );
    const root = container.querySelector(".MuiSlider-root") as HTMLElement;
    expect(root.style.getPropertyValue("--fill-lo")).toBe("50%");
    expect(root.style.getPropertyValue("--fill-hi")).toBe("75%");
    expect(root.style.getPropertyValue("--fill-show-tick")).toBe("1");
  });
});

describe("NodeSlider", () => {
  it("is a Slider with the nodrag class", () => {
    const { container } = wrap(<NodeSlider value={5} onChange={() => {}} />);
    expect(container.querySelector(".MuiSlider-root")).toHaveClass("nodrag");
  });
});
