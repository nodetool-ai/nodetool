import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { DatetimeRenderer } from "../../../components/node/output/DatetimeRenderer";
import { Datetime } from "../../../stores/ApiTypes";
import mockTheme from "../../../__mocks__/themeMock";

// Mock the Actions component to avoid complex theme requirements
jest.mock("../../../components/node/output/Actions", () => ({
  __esModule: true,
  default: () => null
}));

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);
};

describe("DatetimeRenderer", () => {
  const mockDatetime: Datetime = {
    type: "datetime",
    year: 2023,
    month: 10,
    day: 15,
    hour: 14,
    minute: 30,
    second: 45,
    microsecond: 0,
    tzinfo: "UTC",
    utc_offset: 0
  };

  it("renders datetime correctly", () => {
    renderWithTheme(<DatetimeRenderer value={mockDatetime} />);
    
    // Locale-independent: accept either MM/DD/YYYY or DD.MM.YYYY (with optional leading zeros)
    expect(
      screen.getByText(/(?:0?10\D+0?15|0?15\D+0?10)\D+2023/)
    ).toBeInTheDocument();
  });

  it("renders different datetime values", () => {
    const newYear: Datetime = {
      type: "datetime",
      year: 2024,
      month: 1,
      day: 1,
      hour: 0,
      minute: 0,
      second: 0,
      microsecond: 0,
      tzinfo: "UTC",
      utc_offset: 0
    };
    
    renderWithTheme(<DatetimeRenderer value={newYear} />);
    
    // Locale-independent: accept either MM/DD/YYYY or DD.MM.YYYY (with optional leading zeros)
    expect(screen.getByText(/0?1\D+0?1\D+2024/)).toBeInTheDocument();
  });
});
