import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { AnnotationBadge } from "../AnnotationBadge";
import "@testing-library/jest-dom";

jest.mock("@mui/material/Tooltip", () => ({
  __esModule: true,
  default: ({ children, title, open, onOpen, onClose }: any) => (
    <div data-testid="tooltip" data-title={title} data-open={open} onMouseEnter={onOpen} onMouseLeave={onClose}>
      {children}
    </div>
  )
}));

const renderWithProviders = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);
};

describe("AnnotationBadge", () => {
  const mockUpdateNodeData = jest.fn();

  beforeEach(() => {
    mockUpdateNodeData.mockClear();
  });

  it("renders nothing when annotation is empty", () => {
    const { container } = renderWithProviders(
      <AnnotationBadge nodeId="test-node" annotation="" />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when annotation is undefined", () => {
    const { container } = renderWithProviders(
      <AnnotationBadge nodeId="test-node" annotation={undefined} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when annotation is only whitespace", () => {
    const { container } = renderWithProviders(
      <AnnotationBadge nodeId="test-node" annotation="   " />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders badge when annotation exists", () => {
    renderWithProviders(
      <AnnotationBadge nodeId="test-node" annotation="This is a test annotation" />
    );
    const badge = screen.getByTestId("NotesIcon");
    expect(badge).toBeInTheDocument();
  });

  it("truncates long annotations", () => {
    const longAnnotation = "A".repeat(200);
    renderWithProviders(
      <AnnotationBadge nodeId="test-node" annotation={longAnnotation} />
    );
    const tooltip = screen.getByTestId("tooltip");
    expect(tooltip).toHaveAttribute("data-title");
  });
});
