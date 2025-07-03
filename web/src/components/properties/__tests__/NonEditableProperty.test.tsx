import React from "react";
import { render, screen } from "@testing-library/react";
import NonEditableProperty from "../NonEditableProperty";

jest.mock("../../themes/ThemeNodetool", () => ({
  __esModule: true,
  default: {
    palette: {},
    fontSizeNormal: "",
    fontFamily1: "",
    fontSizeSmall: ""
  }
}));

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
    render(<NonEditableProperty {...defaultProps} />);
    expect(screen.getByText("Readonly")).toBeInTheDocument();
  });
});
