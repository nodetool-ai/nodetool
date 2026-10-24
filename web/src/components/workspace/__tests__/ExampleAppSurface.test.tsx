import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import ExampleAppSurface from "../ExampleAppSurface";

const installExampleApp = jest.fn();
const openTab = jest.fn();

jest.mock("../WorkspaceDocumentBar", () => ({
  __esModule: true,
  default: ({
    tab,
    status,
    actions
  }: {
    tab: { title: string };
    status?: React.ReactNode;
    actions?: React.ReactNode;
  }) => (
    <div role="toolbar" aria-label={`${tab.title} document`}>
      {status}
      {actions}
    </div>
  )
}));

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
        <ExampleAppSurface
          slug="sku-factory"
          title="SKU Factory"
          tab={{
            id: "example-app:sku-factory",
            type: "example-app",
            ref: "sku-factory",
            mode: "view",
            title: "SKU Factory"
          }}
        />
      </ThemeProvider>
    </QueryClientProvider>
  );

describe("ExampleAppSurface", () => {
  it("runs the app and installs a copy into its own tab", async () => {
    installExampleApp.mockResolvedValue({ id: "app-2", name: "SKU Factory" });
    renderSurface();

    expect(await screen.findByText("Using sku-factory")).toBeInTheDocument();
    const bar = screen.getByRole("toolbar", { name: "SKU Factory document" });
    expect(bar).toHaveTextContent("Read only");
    await userEvent.click(within(bar).getByRole("button", { name: "Edit app" }));

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
