import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import { InspectorSection } from "../InspectorSection";

const renderSection = (props: Partial<Parameters<typeof InspectorSection>[0]> = {}) =>
  render(<ThemeProvider theme={mockTheme}>
    <InspectorSection title="Transform" {...props}><span>Position row</span></InspectorSection>
  </ThemeProvider>);

describe("InspectorSection", () => {
  it("folds its rows when the title is clicked", () => {
    const onToggle = jest.fn();
    renderSection({ onToggle });
    const header = screen.getByRole("button", { expanded: true });
    expect(header).toHaveTextContent("Transform");
    fireEvent.click(header);
    expect(onToggle).toHaveBeenCalledWith(false);
    expect(screen.getByRole("button", { expanded: false })).toBeInTheDocument();
  });

  it("toggles the activation checkbox without folding the section", () => {
    const onCheckedChange = jest.fn();
    const onToggle = jest.fn();
    renderSection({ checked: false, onCheckedChange, onToggle });
    const checkbox = screen.getByRole("checkbox", { name: "Transform enabled" });
    expect(checkbox).toHaveAttribute("aria-checked", "false");
    fireEvent.click(checkbox);
    fireEvent.keyDown(checkbox, { key: "Enter" });
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("runs the trailing action without folding the section", () => {
    const onClick = jest.fn();
    const onToggle = jest.fn();
    renderSection({ onToggle, action: { icon: <span>x</span>, label: "Remove Transform", onClick } });
    fireEvent.click(screen.getByRole("button", { name: "Remove Transform" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("shows a passive meta readout without uppercasing it", () => {
    renderSection({ meta: "#ff00aa" });
    const meta = screen.getByText("#ff00aa");
    expect(meta).toHaveClass("inspector-section-meta");
    expect(meta).toHaveStyle({ textTransform: "none" });
  });
});
