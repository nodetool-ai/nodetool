import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import NonEditableProperty from "../NonEditableProperty";

const defaultProps = {
  property: {
    name: "readonly",
    type: { type: "str", optional: false, type_args: [] }
  } as any,
  propertyIndex: "0",
  value: "",
  onChange: jest.fn(),
  nodeId: "node1",
  nodeType: "test.node"
};

describe("NonEditableProperty", () => {
  it("renders only the label", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NonEditableProperty {...defaultProps} />
      </ThemeProvider>
    );
    expect(screen.getByText("Readonly")).toBeInTheDocument();
  });
});
