import React, { useState } from "react";
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

/** Feeds each change back as props, as the dataframe property does. */
const Harness: React.FC<{ initial: ColumnDef[]; onChange: jest.Mock }> = ({
  initial,
  onChange
}) => {
  const [columns, setColumns] = useState(initial);
  return (
    <ThemeProvider theme={mockTheme}>
      <ColumnsManager
        columns={columns}
        onChange={(next) => {
          onChange(next);
          setColumns(next);
        }}
      />
    </ThemeProvider>
  );
};

describe("ColumnsManager", () => {
  it("keeps the same input while a name is edited", async () => {
    const user = userEvent.setup();
    render(<Harness initial={[column("ab")]} onChange={jest.fn()} />);

    const input = screen.getByDisplayValue("ab");
    await user.click(input);
    await user.keyboard("{ArrowLeft}x");

    expect(screen.getByDisplayValue("axb")).toBe(input);
  });

  it("does not apply a rename to another column's name", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <Harness initial={[column("a"), column("ab")]} onChange={onChange} />
    );

    await user.type(screen.getByDisplayValue("ab"), "{Backspace}");

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("ab")).toBeInTheDocument();
  });
});
