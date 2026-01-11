import React from "react";
import { render, screen } from "@testing-library/react";
import CalendarEventView from "../../../components/node/CalendarEventView";
import { CalendarEvent } from "../../../stores/ApiTypes";

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
    render(<CalendarEventView event={mockEvent} />);

    expect(screen.getByText("Team Meeting")).toBeInTheDocument();
    expect(screen.getByText(/Conference Room A/)).toBeInTheDocument();
    expect(screen.getByText("Work")).toBeInTheDocument();
    expect(screen.getByText("Discuss quarterly goals")).toBeInTheDocument();
  });

  it("formats dates correctly", () => {
    render(<CalendarEventView event={mockEvent} />);
    // Locale-independent: accept either MM/DD/YYYY or DD.MM.YYYY (with optional leading zeros)
    expect(
      screen.getByText(/(?:0?10\D+0?15|0?15\D+0?10)\D+2023/)
    ).toBeInTheDocument();
  });
});
