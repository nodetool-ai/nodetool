import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import ErrorBanner from "../ErrorBanner";
import { useBugReportStore } from "../../../stores/BugReportStore";

const renderBanner = (props: Partial<React.ComponentProps<typeof ErrorBanner>> = {}) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ErrorBanner
        report={{
          source: "operation-failure",
          summary: "Spreadsheet failed to load",
          errorText: "502 Bad Gateway"
        }}
        {...props}
      >
        Could not load this spreadsheet.
      </ErrorBanner>
    </ThemeProvider>
  );

beforeEach(() => {
  useBugReportStore.getState().close();
});

describe("ErrorBanner", () => {
  it("announces the failure as an alert", () => {
    renderBanner();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not load this spreadsheet."
    );
  });

  it("opens the bug-report dialog with the surface's context", async () => {
    const user = userEvent.setup();
    renderBanner();
    await user.click(screen.getByRole("button", { name: /report/i }));
    expect(useBugReportStore.getState().context).toMatchObject({
      source: "operation-failure",
      summary: "Spreadsheet failed to load",
      errorText: "502 Bad Gateway"
    });
  });

  it("offers a retry only when the surface can retry", async () => {
    const user = userEvent.setup();
    const onRetry = jest.fn();
    const { unmount } = renderBanner();
    expect(
      screen.queryByRole("button", { name: "Try again" })
    ).not.toBeInTheDocument();
    unmount();

    renderBanner({ onRetry, retryLabel: "Try again" });
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
