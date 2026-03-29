import React from "react";
import { render, screen } from "@testing-library/react";
import { DataTable } from "../DataTable";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import userEvent from "@testing-library/user-event";

const columns = [
  { key: "name", label: "Name" },
  { key: "type", label: "Type" },
];

const rows = [
  { name: "File.txt", type: "text" },
  { name: "Image.png", type: "image" },
];

describe("DataTable", () => {
  const renderWithTheme = (component: React.ReactElement) => {
    return render(
      <ThemeProvider theme={mockTheme}>{component}</ThemeProvider>
    );
  };

  it("renders column headers", () => {
    renderWithTheme(<DataTable columns={columns} rows={rows} />);
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Type")).toBeInTheDocument();
  });

  it("renders row data", () => {
    renderWithTheme(<DataTable columns={columns} rows={rows} />);
    expect(screen.getByText("File.txt")).toBeInTheDocument();
    expect(screen.getByText("Image.png")).toBeInTheDocument();
    expect(screen.getByText("text")).toBeInTheDocument();
    expect(screen.getByText("image")).toBeInTheDocument();
  });

  it("handles row click", async () => {
    const user = userEvent.setup();
    const handleClick = jest.fn();
    renderWithTheme(
      <DataTable columns={columns} rows={rows} onRowClick={handleClick} />
    );

    await user.click(screen.getByText("File.txt"));
    expect(handleClick).toHaveBeenCalledWith(rows[0], 0);
  });

  it("renders in compact mode", () => {
    const { container } = renderWithTheme(
      <DataTable columns={columns} rows={rows} compact />
    );
    expect(container.querySelector("table")).toBeInTheDocument();
  });

  it("renders with custom renderer", () => {
    const customColumns = [
      { key: "name", label: "Name" },
      {
        key: "type",
        label: "Type",
        render: (val: React.ReactNode) => <strong>{val}</strong>,
      },
    ];
    renderWithTheme(<DataTable columns={customColumns} rows={rows} />);
    const strongEl = screen.getByText("text").closest("strong");
    expect(strongEl).toBeInTheDocument();
  });

  it("renders empty table with no rows", () => {
    renderWithTheme(<DataTable columns={columns} rows={[]} />);
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Type")).toBeInTheDocument();
  });
});
