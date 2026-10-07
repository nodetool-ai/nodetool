import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import ExampleAppSurface from "../ExampleAppSurface";

const installExampleApp = jest.fn();
const openTab = jest.fn();

jest.mock("../../portal/ExampleAppUseView", () => ({
  __esModule: true,
  default: ({ slug }: { slug: string }) => <div>Using {slug}</div>
}));

jest.mock("../../../utils/exampleApps", () => ({
  __esModule: true,
  installExampleApp: (...args: unknown[]) => installExampleApp(...args)
}));

jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  __esModule: true,
  creationProjectId: () => "proj-1",
  useWorkspaceTabsStore: <T,>(selector: (s: { openTab: unknown }) => T) =>
    selector({ openTab: (...args: unknown[]) => openTab(...args) })
}));

jest.mock("../../../stores/NotificationStore", () => ({
  __esModule: true,
  useNotificationStore: <T,>(selector: (s: { addNotification: unknown }) => T) =>
    selector({ addNotification: jest.fn() })
}));

const renderSurface = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ThemeProvider theme={mockTheme}>
        <ExampleAppSurface slug="sku-factory" title="SKU Factory" />
      </ThemeProvider>
    </QueryClientProvider>
  );

describe("ExampleAppSurface", () => {
  it("runs the app and installs a copy into its own tab", async () => {
    installExampleApp.mockResolvedValue({ id: "app-2", name: "SKU Factory" });
    renderSurface();

    expect(await screen.findByText("Using sku-factory")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Edit app" }));

    await waitFor(() =>
      expect(openTab).toHaveBeenCalledWith({
        type: "application",
        ref: "app-2",
        mode: "view",
        title: "SKU Factory",
        projectId: "proj-1"
      })
    );
    expect(installExampleApp).toHaveBeenCalledWith("sku-factory", "proj-1");
  });
});
