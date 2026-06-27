import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import AddDynamicOutputDialog from "../AddDynamicOutputDialog";

const renderDialog = (
  props: Partial<React.ComponentProps<typeof AddDynamicOutputDialog>> = {}
) => {
  const onAdd = jest.fn();
  const onClose = jest.fn();
  render(
    <ThemeProvider theme={mockTheme}>
      <AddDynamicOutputDialog
        open
        onClose={onClose}
        onAdd={onAdd}
        {...props}
      />
    </ThemeProvider>
  );
  return { onAdd, onClose };
};

describe("AddDynamicOutputDialog", () => {
  it("renders nothing when closed", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <AddDynamicOutputDialog open={false} onClose={jest.fn()} onAdd={jest.fn()} />
      </ThemeProvider>
    );
    expect(screen.queryByText("Add Output")).not.toBeInTheDocument();
  });

  it("adds an output with the default type and closes", async () => {
    const user = userEvent.setup();
    const { onAdd, onClose } = renderDialog();

    await user.type(screen.getByLabelText("Name"), "score");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(onAdd).toHaveBeenCalledWith("score", {
      type: "str",
      type_args: [],
      optional: false
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("respects a chosen type", async () => {
    const user = userEvent.setup();
    const { onAdd } = renderDialog();

    await user.type(screen.getByLabelText("Name"), "count");
    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "int" }));
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(onAdd).toHaveBeenCalledWith("count", {
      type: "int",
      type_args: [],
      optional: false
    });
  });

  it("rejects a name that starts with a number", async () => {
    const user = userEvent.setup();
    const { onAdd } = renderDialog();

    await user.type(screen.getByLabelText("Name"), "1bad");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(onAdd).not.toHaveBeenCalled();
    expect(
      screen.getByText(/cannot start with a number/i)
    ).toBeInTheDocument();
  });

  it("submits on Enter", async () => {
    const user = userEvent.setup();
    const { onAdd } = renderDialog();

    await user.type(screen.getByLabelText("Name"), "result{Enter}");

    expect(onAdd).toHaveBeenCalledWith("result", {
      type: "str",
      type_args: [],
      optional: false
    });
  });
});
