import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { unzipSync, strFromU8 } from "fflate";
import mockTheme from "../../../__mocks__/themeMock";
import BugReportDialog from "../BugReportDialog";
import { mockBugReportsSubmit } from "../../../__mocks__/trpcClientMock";

// The hosted web app: not localhost, not the desktop app.
jest.mock("../../../lib/env", () => ({
  isLocalhost: false,
  isProduction: true,
  isElectron: false
}));

jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: (selector: (state: unknown) => unknown) =>
    selector({ getCurrentWorkflow: () => undefined })
}));

jest.mock("../../../stores/LogStore", () => ({
  __esModule: true,
  default: (selector: (state: unknown) => unknown) => selector({ logs: [] })
}));

const addNotification = jest.fn();
jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: (selector: (state: unknown) => unknown) =>
    selector({ addNotification })
}));

const renderDialog = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ThemeProvider theme={mockTheme}>
        <BugReportDialog
          context={{ source: "node-error", errorText: "Resize failed" }}
          onClose={jest.fn()}
        />
      </ThemeProvider>
    </QueryClientProvider>
  );

describe("BugReportDialog on the hosted app", () => {
  beforeEach(() => {
    mockBugReportsSubmit.mockClear();
    addNotification.mockClear();
    window.URL.createObjectURL = jest.fn(() => "blob:mock");
    window.open = jest.fn();
  });

  it("sends the report to the backend instead of GitHub", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(
      screen.getByLabelText(/what went wrong/i),
      "Resize throws on PNG"
    );
    await user.click(screen.getByRole("button", { name: /send report/i }));

    await waitFor(() => expect(mockBugReportsSubmit).toHaveBeenCalled());
    const [input] = mockBugReportsSubmit.mock.calls[0] as unknown as [
      {
        source: string;
        title: string;
        description: string;
        body: string;
        bundle_base64: string;
      }
    ];
    expect(input.source).toBe("node-error");
    expect(input.title).toBe("[Bug]: Resize throws on PNG");
    expect(input.description).toBe("Resize throws on PNG");
    expect(input.body).toContain("Resize throws on PNG");
    expect(input.body).not.toContain("drag it into this issue");

    const bytes = Uint8Array.from(atob(input.bundle_base64), (char) =>
      char.charCodeAt(0)
    );
    const entries = unzipSync(bytes);
    expect(Object.keys(entries)).toEqual(
      expect.arrayContaining(["report.md", "system.txt", "error.txt"])
    );
    expect(strFromU8(entries["error.txt"])).toContain("Resize failed");

    expect(await screen.findByText(/your report was sent/i)).toBeInTheDocument();
    expect(window.URL.createObjectURL).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
  });

  it("keeps the form open and says why when the send fails", async () => {
    mockBugReportsSubmit.mockRejectedValueOnce(new Error("offline"));
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText(/what went wrong/i), "Broken");
    await user.click(screen.getByRole("button", { name: /send report/i }));

    await waitFor(() =>
      expect(addNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "error",
          content: "Could not send the report: offline"
        })
      )
    );
    expect(screen.getByRole("button", { name: /send report/i })).toBeEnabled();
  });
});
