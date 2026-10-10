import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

jest.mock("../../inputs/ColorPicker", () => ({
  __esModule: true,
  default: () => <div data-testid="color-picker" />
}));

import ColorProperty from "../ColorProperty";

const renderColor = (value: unknown) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ColorProperty
        property={
          {
            name: "brand_color",
            type: { type: "color", optional: false, type_args: [] }
          } as never
        }
        propertyIndex="0"
        value={value}
        onChange={jest.fn()}
        nodeId="node1"
        nodeType="test.node"
      />
    </ThemeProvider>
  );

describe("ColorProperty", () => {
  it("shows a color stored as a color object", () => {
    renderColor({ type: "color", value: "#112233" });
    expect(screen.getByText("#112233")).toBeInTheDocument();
  });

  it("shows a color stored as a bare hex string", () => {
    renderColor("#d4512b");
    expect(screen.getByText("#d4512b")).toBeInTheDocument();
    expect(screen.queryByText("No color selected")).not.toBeInTheDocument();
  });
});
