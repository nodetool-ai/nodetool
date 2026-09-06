import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import { ThinkingIndicator } from "../ThinkingIndicator";

const renderIndicator = (props: Parameters<typeof ThinkingIndicator>[0] = {}) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ThinkingIndicator {...props} />
    </ThemeProvider>
  );

it("shows the label beside the mark", () => {
  renderIndicator({ label: "Writing 6 shots" });

  expect(screen.getByText("Writing 6 shots")).toBeInTheDocument();
  expect(screen.getByTestId("thinking-mark")).toBeInTheDocument();
});

// The mark is decoration; the label is the message. A screen reader that
// walks the cells reads nothing and says so seven times.
it("hides the mark from assistive tech", () => {
  renderIndicator({ label: "Working" });

  expect(screen.getByTestId("thinking-mark")).toHaveAttribute(
    "aria-hidden",
    "true"
  );
});

// Two live regions for one wait is worse than none, so announcing is opt-in.
it("announces only when asked", () => {
  const { unmount } = renderIndicator({ label: "Working" });
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  unmount();

  renderIndicator({ label: "Working", announce: true });
  expect(screen.getByRole("status")).toHaveTextContent("Working");
});

it("renders the mark alone when there is nothing to say", () => {
  renderIndicator();

  expect(screen.getByTestId("thinking-mark")).toBeInTheDocument();
  expect(screen.getByTestId("thinking-mark").children).toHaveLength(7);
});
