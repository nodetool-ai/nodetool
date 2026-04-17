import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { MetadataListRow } from "../MetadataListRow";
import mockTheme from "../../../__mocks__/themeMock";

const renderRow = (
  props: Partial<React.ComponentProps<typeof MetadataListRow>> = {}
) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <MetadataListRow primary="Primary" {...props} />
    </ThemeProvider>
  );

describe("MetadataListRow", () => {
  it("renders the primary text", () => {
    renderRow({ primary: "My workflow" });
    expect(screen.getByText("My workflow")).toBeInTheDocument();
  });

  it("renders metadata values", () => {
    renderRow({
      metadata: [{ value: "3 KB" }, { value: "2m ago" }]
    });
    expect(screen.getByText("3 KB")).toBeInTheDocument();
    expect(screen.getByText("2m ago")).toBeInTheDocument();
  });

  it("renders metadata labels when provided", () => {
    renderRow({
      metadata: [{ label: "size:", value: "3 KB" }]
    });
    expect(screen.getByText("size:")).toBeInTheDocument();
    expect(screen.getByText("3 KB")).toBeInTheDocument();
  });

  it("renders separator between metadata items", () => {
    const { container } = renderRow({
      metadata: [{ value: "A" }, { value: "B" }]
    });
    // Separator has a non-breaking space + middle dot
    expect(container.textContent).toContain("\u00A0·\u00A0");
  });

  it("does not render separator when a single item is present", () => {
    const { container } = renderRow({
      metadata: [{ value: "A" }]
    });
    expect(container.textContent).not.toContain("\u00A0·\u00A0");
  });

  it("renders secondary text when provided", () => {
    renderRow({ secondary: "subtitle line" });
    expect(screen.getByText("subtitle line")).toBeInTheDocument();
  });

  it("renders actions slot", () => {
    renderRow({
      actions: <button data-testid="row-action">go</button>
    });
    expect(screen.getByTestId("row-action")).toBeInTheDocument();
  });

  it("supports below metadata placement", () => {
    renderRow({
      metadata: [{ value: "2m ago" }],
      metadataPlacement: "below"
    });
    expect(screen.getByText("2m ago")).toBeInTheDocument();
  });
});
