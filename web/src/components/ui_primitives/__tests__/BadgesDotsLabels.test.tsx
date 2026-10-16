import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { CountBadge } from "../CountBadge";
import { StatusDot } from "../StatusDot";
import { MediaLabel } from "../MediaLabel";
import mockTheme from "../../../__mocks__/themeMock";

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>);

describe("CountBadge", () => {
  it("anchors the count to its children", () => {
    renderWithTheme(
      <CountBadge count={3}>
        <button>Inbox</button>
      </CountBadge>
    );
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Inbox")).toBeInTheDocument();
  });

  it("caps the count at max", () => {
    renderWithTheme(
      <CountBadge count={120} max={99}>
        <button>Inbox</button>
      </CountBadge>
    );
    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  it("renders a standalone pill without children", () => {
    const { container } = renderWithTheme(<CountBadge count={5} />);
    expect(container.textContent).toBe("5");
  });

  it("hides a standalone zero count unless showZero is set", () => {
    const { container, rerender } = renderWithTheme(<CountBadge count={0} />);
    expect(container.textContent).toBe("");
    rerender(
      <ThemeProvider theme={mockTheme}>
        <CountBadge count={0} showZero />
      </ThemeProvider>
    );
    expect(container.textContent).toBe("0");
  });
});

describe("StatusDot", () => {
  it("is hidden from assistive tech without a label", () => {
    const { container } = renderWithTheme(<StatusDot tone="error" />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  it("is an image with the label as its name", () => {
    renderWithTheme(<StatusDot tone="warning" label="Unsaved changes" />);
    expect(screen.getByRole("img", { name: "Unsaved changes" })).toBeInTheDocument();
  });

  it("uses a larger circle for the medium size", () => {
    const { container } = renderWithTheme(
      <>
        <StatusDot data-testid="s" />
        <StatusDot data-testid="m" size="medium" />
      </>
    );
    const small = getComputedStyle(container.querySelector('[data-testid="s"]')!);
    const medium = getComputedStyle(container.querySelector('[data-testid="m"]')!);
    expect(small.width).toBe("6px");
    expect(medium.width).toBe("8px");
  });

  it("adds an animation only when it pulses", () => {
    const css = () =>
      Array.from(document.styleSheets)
        .flatMap((sheet) => Array.from(sheet.cssRules))
        .map((rule) => rule.cssText)
        .join("\n");
    const { container } = renderWithTheme(<StatusDot pulse />);
    expect(container.firstElementChild?.className).toMatch(/css-/);
    expect(css()).toMatch(/animation:[^;]*infinite/);
  });
});

describe("MediaLabel", () => {
  it("renders its text", () => {
    renderWithTheme(<MediaLabel>640 × 480</MediaLabel>);
    expect(screen.getByText("640 × 480")).toBeInTheDocument();
  });

  it("pins to a corner and ignores pointer events", () => {
    renderWithTheme(<MediaLabel corner="bottom-right">1 × 1</MediaLabel>);
    const style = getComputedStyle(screen.getByText("1 × 1"));
    expect(style.position).toBe("absolute");
    expect(style.pointerEvents).toBe("none");
    expect(style.bottom).toBe("2px");
    expect(style.right).toBe("2px");
  });

  it("flows inline without a corner", () => {
    renderWithTheme(<MediaLabel>0:12</MediaLabel>);
    expect(getComputedStyle(screen.getByText("0:12")).position).not.toBe("absolute");
  });
});
