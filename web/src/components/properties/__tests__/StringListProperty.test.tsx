import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import type { Property } from "../../../stores/ApiTypes";

jest.mock("../../../config/data_types", () => ({}));

import StringListProperty from "../StringListProperty";

const property = {
  name: "tags",
  type: { type: "list", optional: false, type_args: [{ type: "str" }] }
} as unknown as Property;

describe("StringListProperty", () => {
  it("keeps text typed without Enter when the field loses focus", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <ThemeProvider theme={mockTheme}>
        <StringListProperty
          property={property}
          propertyIndex="0"
          value={["a"]}
          onChange={onChange}
          nodeId="node1"
          nodeType="test.node"
        />
      </ThemeProvider>
    );

    await user.type(screen.getByRole("combobox"), "b");
    await user.tab();

    expect(onChange).toHaveBeenCalledWith(["a", "b"]);
  });
});
