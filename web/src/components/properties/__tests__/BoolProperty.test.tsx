import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

// Mock NodeSwitch to avoid Switch theme complexities
jest.mock("../../editor_ui/NodeSwitch", () => ({
  __esModule: true,
  NodeSwitch: ({ checked, onChange, id, inputProps }: any) => (
    <input
      type="checkbox"
      id={id}
      checked={checked}
      onChange={onChange}
      {...inputProps}
    />
  )
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

describe("BoolProperty", () => {
  it("renders a switch and label", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <BoolProperty {...defaultProps} />
      </ThemeProvider>
    );
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
    expect(screen.getByText("Enabled")).toBeInTheDocument();
  });

  it("calls onChange when toggled", () => {
    const onChange = jest.fn();
    render(
      <ThemeProvider theme={mockTheme}>
        <BoolProperty {...defaultProps} onChange={onChange} />
      </ThemeProvider>
    );
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
