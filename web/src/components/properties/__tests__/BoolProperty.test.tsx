import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

jest.mock("../../themes/ThemeNodetool", () => ({
  __esModule: true,
  default: {
    palette: {},
    fontSizeNormal: "",
    fontFamily1: "",
    fontSizeSmall: ""
  }
}));
jest.mock("../../../config/data_types", () => ({}));
jest.mock("../../../stores/ApiClient", () => ({ client: { GET: jest.fn() } }));

import BoolProperty from "../BoolProperty";

const defaultProps = {
  property: {
    name: "enabled",
    type: { type: "bool", optional: false, type_args: [] }
  } as any,
  propertyIndex: "0",
  value: false,
  onChange: jest.fn(),
  nodeId: "node1",
  nodeType: "test.node"
};

const renderWithTheme = (ui: React.ReactElement) => {
  return render(<ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>);
};

describe("BoolProperty", () => {
  it("renders a switch and label", () => {
    renderWithTheme(<BoolProperty {...defaultProps} />);
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
    expect(screen.getByText("Enabled")).toBeInTheDocument();
  });

  it("calls onChange when toggled", () => {
    const onChange = jest.fn();
    renderWithTheme(<BoolProperty {...defaultProps} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
