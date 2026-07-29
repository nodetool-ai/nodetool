import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { DatetimeRenderer } from "../../../components/node/output/DatetimeRenderer";
import { Datetime } from "../../../stores/ApiTypes";
import { formatDateTime } from "../../../utils/formatUtils";
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
    
    // The renderer delegates to the shared formatDateTime helper
    expect(
      screen.getByText(formatDateTime(new Date(2023, 9, 15, 14, 30, 45)))
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
    
    // The renderer delegates to the shared formatDateTime helper
    expect(
      screen.getByText(formatDateTime(new Date(2024, 0, 1, 0, 0, 0)))
    ).toBeInTheDocument();
  });
});
