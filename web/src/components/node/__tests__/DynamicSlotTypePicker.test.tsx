import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import DynamicSlotTypePicker from "../DynamicSlotTypePicker";
import type { NodeMetadata, TypeMetadata } from "../../../stores/ApiTypes";

const type = (name: string): TypeMetadata => ({
  type: name,
  optional: false,
  values: null,
  type_args: [],
  type_name: null
});

const renderPicker = (
  props: Partial<React.ComponentProps<typeof DynamicSlotTypePicker>> = {}
) => {
  const onChange = jest.fn();
  render(
    <ThemeProvider theme={mockTheme}>
      <DynamicSlotTypePicker
        propertyName="picture"
        value={type("any")}
        onChange={onChange}
        {...props}
      />
    </ThemeProvider>
  );
  return { onChange };
};

describe("DynamicSlotTypePicker", () => {
  it("shows the current slot type on the chip", () => {
    renderPicker({ value: type("image") });

    expect(
      screen.getByRole("button", { name: "Slot type for picture" })
    ).toHaveTextContent("image");
  });

  it("shows `any` for an untyped slot", () => {
    renderPicker();

    expect(
      screen.getByRole("button", { name: "Slot type for picture" })
    ).toHaveTextContent("any");
  });

  it("offers the palette and reports the pick", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker();

    await user.click(screen.getByRole("button", { name: "Slot type for picture" }));

    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.click(screen.getByText("image"));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ type: "image" })
    );
  });

  it("offers list types", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker();

    await user.click(screen.getByRole("button", { name: "Slot type for picture" }));
    await user.click(screen.getByText("image[]"));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "list",
        type_args: [expect.objectContaining({ type: "image" })]
      })
    );
  });

  it("narrows the palette to allowed_dynamic_slot_types", async () => {
    const user = userEvent.setup();
    const metadata = {
      allowed_dynamic_slot_types: [type("str"), type("image")]
    } as NodeMetadata;
    renderPicker({ nodeMetadata: metadata });

    await user.click(screen.getByRole("button", { name: "Slot type for picture" }));

    const options = screen.getByRole("listbox");
    expect(options).toHaveTextContent("str");
    expect(options).toHaveTextContent("image");
    expect(options).not.toHaveTextContent("dataframe");
  });
});
