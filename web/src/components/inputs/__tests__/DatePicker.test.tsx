import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import DatePicker from "../DatePicker";

describe("DatePicker", () => {
  it("shows date-only values on the same local calendar day", () => {
    const originalTimezone = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    try {
      render(
        <ThemeProvider theme={mockTheme}>
          <DatePicker value="2024-01-01" onChange={jest.fn()} />
        </ThemeProvider>
      );

      expect(screen.getByLabelText("Date and time")).toHaveValue(
        "2024-01-01T00:00"
      );
    } finally {
      if (originalTimezone === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = originalTimezone;
      }
    }
  });
});
