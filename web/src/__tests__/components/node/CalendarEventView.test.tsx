import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import CalendarEventView from "../../../components/node/CalendarEventView";
import { CalendarEvent } from "../../../stores/ApiTypes";
import { formatDateTime } from "../../../utils/formatUtils";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ThemeProvider theme={mockTheme}>{children}</ThemeProvider>
);

describe("CalendarEventView", () => {
  const mockEvent: CalendarEvent = {
    type: "calendar_event",
    title: "Team Meeting",
    start_date: {
      type: "datetime",
      year: 2023,
      month: 10,
      day: 15,
      hour: 10,
      minute: 0,
      second: 0,
      microsecond: 0,
      tzinfo: "UTC",
      utc_offset: 0
    },
    end_date: {
      type: "datetime",
      year: 2023,
      month: 10,
      day: 15,
      hour: 11,
      minute: 0,
      second: 0,
      microsecond: 0,
      tzinfo: "UTC",
      utc_offset: 0
    },
    calendar: "Work",
    location: "Conference Room A",
    notes: "Discuss quarterly goals"
  };

  it("renders event details correctly", () => {
    render(<CalendarEventView event={mockEvent} />, { wrapper });

    expect(screen.getByText("Team Meeting")).toBeInTheDocument();
    expect(screen.getByText(/Conference Room A/)).toBeInTheDocument();
    expect(screen.getByText("Work")).toBeInTheDocument();
    expect(screen.getByText("Discuss quarterly goals")).toBeInTheDocument();
  });

  it("formats dates correctly", () => {
    render(<CalendarEventView event={mockEvent} />, { wrapper });
    // The view delegates to the shared formatDateTime helper; the start and
    // end dates render together as "start - end"
    expect(
      screen.getByText(formatDateTime(new Date(2023, 9, 15, 10, 0, 0)), {
        exact: false
      })
    ).toBeInTheDocument();
  });
});
