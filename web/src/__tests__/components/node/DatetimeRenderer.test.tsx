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
    const onCopy = jest.fn();
    renderWithTheme(<DatetimeRenderer value={mockDatetime} onCopy={onCopy} />);
    
    // The exact format depends on locale, but we should see parts of the date
    expect(screen.getByText(/10\/15\/2023/)).toBeInTheDocument();
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
    
    const onCopy = jest.fn();
    renderWithTheme(<DatetimeRenderer value={newYear} onCopy={onCopy} />);
    
    expect(screen.getByText(/1\/1\/2024/)).toBeInTheDocument();
  });
});
