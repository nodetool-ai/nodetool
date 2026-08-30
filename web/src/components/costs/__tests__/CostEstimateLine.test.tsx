/**
 * The compact cost line: what it shows, and when it shows nothing at all.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import CostEstimateLine from "../CostEstimateLine";

const renderLine = (props: React.ComponentProps<typeof CostEstimateLine>) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <CostEstimateLine {...props} />
    </ThemeProvider>
  );

describe("CostEstimateLine", () => {
  it("renders nothing when no figure could be reached", () => {
    const { container } = renderLine({
      estimate: null,
      title: "Estimated cost"
    });
    expect(container).toBeEmptyDOMElement();
  });

  it("reads as an approximation, labelled for a screen reader", () => {
    renderLine({ estimate: { label: "$0.50" }, title: "Estimated cost" });
    const figure = screen.getByLabelText("Estimated cost $0.50");
    expect(figure).toHaveTextContent("≈");
    expect(figure).toHaveTextContent("$0.50");
  });

  it("reads as a floor when the figure leaves a cost out", () => {
    renderLine({
      estimate: { label: "$0.50", isLowerBound: true },
      title: "Estimated cost",
      ariaPrefix: "Estimated sequence cost"
    });
    expect(
      screen.getByLabelText("Estimated sequence cost $0.50")
    ).toHaveTextContent("≥");
  });
});
