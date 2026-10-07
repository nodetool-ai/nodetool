import { render, screen, within } from "@testing-library/react";
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
  creationProjectId: () => "proj-1",
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
    slug: "sku-factory",
    name: "SKU Factory",
    description: "New setting, new light, or a clean cutout.",
    workflows: ["Backdrop", "Relight", "Cut out"],
    operationCount: 3,
    thumbnailUrl: null
  }
];

const renderApps = (compact = false, onBrowseAll?: () => void) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={mockTheme}>
        <DashboardExampleApps compact={compact} onBrowseAll={onBrowseAll} />
      </ThemeProvider>
    </QueryClientProvider>
  );
};

describe("DashboardExampleApps", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listExampleApps.mockResolvedValue(APPS);
  });

  it("lists only known app details without unavailable compatibility metadata", async () => {
    renderApps();

    const card = await screen.findByRole("button", { name: /vary image/i });
    expect(
      within(card).getByText("Change one thing about a photo and keep the rest.")
    ).toBeInTheDocument();
    expect(within(card).getByText("1 workflow")).toBeInTheDocument();
    expect(within(card).queryByText(/unknown/i)).not.toBeInTheDocument();

    const skuFactory = screen.getByRole("button", { name: /sku factory/i });
    expect(within(skuFactory).getByText("3 workflows")).toBeInTheDocument();
    expect(screen.getByText("2 apps")).toBeInTheDocument();
  });

  it("shows four compact app tiles and a way to browse the rest", async () => {
    const onBrowseAll = jest.fn();
    listExampleApps.mockResolvedValue(
      Array.from({ length: 5 }, (_, index) => ({
        ...APPS[0],
        slug: `app-${index + 1}`,
        name: `App ${index + 1}`
      }))
    );
    renderApps(true, onBrowseAll);

    await screen.findByRole("button", { name: /app 1/i });
    expect(screen.getAllByRole("button", { name: /app \d/i })).toHaveLength(4);
    expect(screen.queryByRole("button", { name: /app 5/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "See all apps" }));
    expect(onBrowseAll).toHaveBeenCalledTimes(1);
  });

  it("offers a retry when the list cannot load", async () => {
    listExampleApps.mockRejectedValueOnce(new Error("offline"));
    const user = userEvent.setup();
    renderApps();

    await user.click(await screen.findByRole("button", { name: /retry/i }));

    expect(await screen.findByRole("button", { name: /vary image/i })).toBeInTheDocument();
  });
});

it("opens a used app in its own tab without installing it", async () => {
  listExampleApps.mockResolvedValue(APPS);
  renderApps();
  await userEvent.click(await screen.findByRole("button", { name: /vary image/i }));

  expect(openTab).toHaveBeenCalledWith({
    type: "example-app",
    ref: "vary-image",
    mode: "view",
    title: "Vary Image"
  });
  expect(installExampleApp).not.toHaveBeenCalled();
  expect(screen.getByText("Start from an app")).toBeInTheDocument();
});
