import React from "react";
import { render, screen } from "@testing-library/react";
import { SelectField } from "../SelectField";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import userEvent from "@testing-library/user-event";

describe("SelectField", () => {
  const renderWithTheme = (component: React.ReactElement) => {
    return render(
      <ThemeProvider theme={mockTheme}>{component}</ThemeProvider>
    );
  };

  const options = [
    { value: "red", label: "Red" },
    { value: "blue", label: "Blue" }
  ] as const;

  it("renders a combobox with the label above the control", () => {
    renderWithTheme(
      <SelectField
        label="Color"
        value="red"
        onChange={jest.fn()}
        options={options}
      />
    );
    expect(screen.getByText("Color")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("renders the outlined variant by default", () => {
    renderWithTheme(
      <SelectField
        label="Color"
        value="red"
        onChange={jest.fn()}
        options={options}
      />
    );
    const combobox = screen.getByRole("combobox");
    expect(combobox.closest(".MuiOutlinedInput-root")).not.toBeNull();
    expect(combobox.closest(".MuiInput-root")).toBeNull();
  });

  it("still supports the standard variant as an explicit opt-in", () => {
    renderWithTheme(
      <SelectField
        label="Color"
        value="red"
        onChange={jest.fn()}
        options={options}
        variant="standard"
      />
    );
    const combobox = screen.getByRole("combobox");
    expect(combobox.closest(".MuiInput-root")).not.toBeNull();
    expect(combobox.closest(".MuiOutlinedInput-root")).toBeNull();
  });

  it("associates the label with the combobox", () => {
    renderWithTheme(
      <SelectField
        label="Color"
        value="red"
        onChange={jest.fn()}
        options={options}
      />
    );
    const combobox = screen.getByRole("combobox", { name: "Color" });
    expect(screen.getByLabelText("Color")).toBe(combobox);
    // MUI appends the value node's id ("<labelId> <valueId>") — assert the
    // label id is referenced, not the exact attribute value.
    expect(combobox.getAttribute("aria-labelledby")).toContain(
      screen.getByText("Color").id
    );
  });

  it("keeps an accessible name when the label is hidden", () => {
    renderWithTheme(
      <SelectField
        label="Color"
        value="red"
        onChange={jest.fn()}
        options={options}
        hideLabel
      />
    );
    expect(screen.queryByText("Color")).not.toBeInTheDocument();
    const combobox = screen.getByRole("combobox", { name: "Color" });
    expect(screen.getByLabelText("Color")).toBe(combobox);
  });

  it("calls onChange with the selected value", async () => {
    const user = userEvent.setup();
    const handleChange = jest.fn();
    renderWithTheme(
      <SelectField
        label="Color"
        value="red"
        onChange={handleChange}
        options={options}
      />
    );

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Blue" }));
    expect(handleChange).toHaveBeenCalledWith("blue");
  });

  it("shows the description below the control", () => {
    renderWithTheme(
      <SelectField
        label="Color"
        value="red"
        onChange={jest.fn()}
        options={options}
        description="Pick a color."
      />
    );
    expect(screen.getByText("Pick a color.")).toBeInTheDocument();
  });

  it("disables the combobox", () => {
    renderWithTheme(
      <SelectField
        label="Color"
        value="red"
        onChange={jest.fn()}
        options={options}
        disabled
      />
    );
    expect(screen.getByRole("combobox")).toHaveAttribute(
      "aria-disabled",
      "true"
    );
  });

  it("forwards ref to the root element", () => {
    const ref = React.createRef<HTMLDivElement>();
    renderWithTheme(
      <SelectField
        ref={ref}
        label="Color"
        value="red"
        onChange={jest.fn()}
        options={options}
      />
    );
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});
