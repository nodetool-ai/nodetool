import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import DashboardExampleApps from "../DashboardExampleApps";

const listExampleApps = jest.fn();
const installExampleApp = jest.fn();
const openTab = jest.fn();
const addNotification = jest.fn();

jest.mock("../../../utils/exampleApps", () => ({
  __esModule: true,
  listExampleApps: (...args: unknown[]) => listExampleApps(...args),
  installExampleApp: (...args: unknown[]) => installExampleApp(...args)
}));

jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  __esModule: true,
  useWorkspaceTabsStore: <T,>(selector: (s: { openTab: unknown }) => T) =>
    selector({ openTab: (...args: unknown[]) => openTab(...args) })
}));

jest.mock("../../../stores/NotificationStore", () => ({
  __esModule: true,
  useNotificationStore: <T,>(
    selector: (s: { addNotification: unknown }) => T
  ) =>
    selector({
      addNotification: (...args: unknown[]) => addNotification(...args)
    })
}));

const APPS = [
  {
    slug: "vary-image",
    name: "Vary Image",
    description: "Change one thing about a photo and keep the rest.",
    workflows: ["Edit a Still with Words"],
    operationCount: 1,
    thumbnailUrl: "/api/workflows/examples/thumbnails/Edit.jpg?v=1"
  },
  {
    slug: "product-reshoot",
    name: "Product Reshoot",
    description: "New setting, new light, or a clean cutout.",
    workflows: ["Backdrop", "Relight", "Cut out"],
    operationCount: 3,
    thumbnailUrl: null
  }
];

const renderApps = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={mockTheme}>
        <DashboardExampleApps />
      </ThemeProvider>
    </QueryClientProvider>
  );
};

describe("DashboardExampleApps", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listExampleApps.mockResolvedValue(APPS);
  });

  it("lists each app as a card with its description and workflow count", async () => {
    renderApps();

    const card = await screen.findByRole("button", { name: /vary image/i });
    expect(
      within(card).getByText("Change one thing about a photo and keep the rest.")
    ).toBeInTheDocument();
    expect(within(card).getByText("1 workflow")).toBeInTheDocument();

    const reshoot = screen.getByRole("button", { name: /product reshoot/i });
    expect(within(reshoot).getByText("3 workflows")).toBeInTheDocument();
    expect(screen.getByText("2 apps")).toBeInTheDocument();
  });

  it("installs an app on click and opens it", async () => {
    const user = userEvent.setup();
    installExampleApp.mockResolvedValue({ id: "app-1", name: "Vary Image" });
    renderApps();

    await user.click(await screen.findByRole("button", { name: /vary image/i }));

    await waitFor(() => expect(openTab).toHaveBeenCalledTimes(1));
    expect(installExampleApp).toHaveBeenCalledWith("vary-image");
    expect(openTab).toHaveBeenCalledWith({
      type: "application",
      ref: "app-1",
      title: "Vary Image"
    });
    expect(addNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "success" })
    );
  });

  it("reports a failed install without opening anything", async () => {
    const user = userEvent.setup();
    installExampleApp.mockRejectedValue(new Error("No FAL key"));
    renderApps();

    await user.click(await screen.findByRole("button", { name: /vary image/i }));

    await waitFor(() =>
      expect(addNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "error",
          content: expect.stringContaining("No FAL key")
        })
      )
    );
    expect(openTab).not.toHaveBeenCalled();
  });

  it("offers a retry when the list cannot load", async () => {
    listExampleApps.mockRejectedValueOnce(new Error("offline"));
    const user = userEvent.setup();
    renderApps();

    await user.click(await screen.findByRole("button", { name: /retry/i }));

    expect(await screen.findByRole("button", { name: /vary image/i })).toBeInTheDocument();
  });
});
