import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import type { ColumnDef } from "../../../stores/ApiTypes";
import ColumnsManager from "../ColumnsManager";

const column = (name: string): ColumnDef => ({
  name,
  data_type: "string",
  description: ""
});

describe("ColumnsManager delete", () => {
  it("reports the deleted index to onDeleteColumn instead of onChange", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    const onDeleteColumn = jest.fn();
    render(
      <ThemeProvider theme={mockTheme}>
        <ColumnsManager
          columns={[column("name"), column("age"), column("city")]}
          onChange={onChange}
          onDeleteColumn={onDeleteColumn}
        />
      </ThemeProvider>
    );

    await user.click(screen.getAllByRole("button", { name: /delete/i })[0]);

    expect(onDeleteColumn).toHaveBeenCalledWith(0);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByDisplayValue("name")).not.toBeInTheDocument();
  });
});
