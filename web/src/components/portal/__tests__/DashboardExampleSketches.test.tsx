import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import DashboardExampleSketches from "../DashboardExampleSketches";

const openTab = jest.fn();
const navigate = jest.fn();
const create = jest.fn();
const update = jest.fn();
const remove = jest.fn();
const invalidate = jest.fn();
const notify = jest.fn();
const documentData = {
  sketch: { canvas: {}, layers: [{ name: "Paint" }] },
  layerBindings: []
};

jest.mock("react-router-dom", () => ({ useNavigate: () => navigate }));
jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  creationProjectId: () => "personal:test",
  useWorkspaceTabsStore: <T,>(
    select: (state: { openTab: typeof openTab }) => T
  ) => select({ openTab })
}));
jest.mock("../../../trpc/client", () => ({
  trpc: {
    useUtils: () => ({
      sketch: { list: { invalidate }, get: { setData: jest.fn() } }
    })
  },
  trpcClient: {
    sketch: {
      create: { mutate: (...args: unknown[]) => create(...args) },
      update: { mutate: (...args: unknown[]) => update(...args) },
      delete: { mutate: (...args: unknown[]) => remove(...args) }
    }
  }
}));
jest.mock("../../../utils/notifyMutationError", () => ({
  notifyMutationError: (...args: unknown[]) => notify(...args)
}));
jest.mock("../../../utils/exampleSketches", () => ({
  ...jest.requireActual("../../../utils/exampleSketches"),
  buildExampleSketch: async () => documentData
}));
jest.mock("../../ui_primitives/ResponsiveImage", () => ({
  ResponsiveImage: ({ alt }: { alt: string }) => <img alt={alt} />
}));

function showGallery(): void {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ThemeProvider theme={mockTheme}>
        <DashboardExampleSketches />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  create.mockResolvedValue({ id: "1234567890abcdef1234567890abcdef" });
  update.mockResolvedValue({
    id: "1234567890abcdef1234567890abcdef",
    name: "Moonlit Tide",
    projectId: "personal:test"
  });
  remove.mockResolvedValue({});
});

it("offers fourteen sketches and opens a saved layered copy in the current project", async () => {
  showGallery();
  expect(screen.getAllByRole("button", { name: /^Open / })).toHaveLength(14);
  await userEvent.click(
    screen.getByRole("button", { name: "Open Moonlit Tide" })
  );
  await waitFor(() =>
    expect(openTab).toHaveBeenCalledWith({
      type: "sketch",
      ref: "1234567890abcdef1234567890abcdef",
      mode: "edit",
      title: "Moonlit Tide",
      projectId: "personal:test"
    })
  );
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({
      id: expect.stringMatching(/^[a-f0-9]{32}$/),
      name: "Moonlit Tide",
      projectId: "personal:test",
      width: 1200,
      height: 900
    })
  );
  expect(update).toHaveBeenCalledWith({
    id: "1234567890abcdef1234567890abcdef",
    document: documentData
  });
  expect(invalidate).toHaveBeenCalled();
  expect(navigate).toHaveBeenCalledWith("/workspace");
});

it.each([
  ["NodeTool", "NodeTool: Brief to Screen", "NodeTool: Director’s Desk"],
  ["Ads", "Serein: Fragrance Campaign", "Volt: Running Campaign"],
  ["Movies", "Signal 09: Film Poster", "The Last Train: Storyboard"]
])(
  "filters %s sketches and returns to the full collection",
  async (category, first, second) => {
    showGallery();
    await userEvent.click(
      screen.getByRole("tab", { name: category })
    );
    expect(screen.getAllByRole("button", { name: /^Open / })).toHaveLength(2);
    expect(screen.getByRole("button", { name: `Open ${first}` })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: `Open ${second}` })
    ).toBeEnabled();
    expect(screen.queryByText("Moonlit Tide")).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("tab", { name: "All" })
    );
    expect(screen.getAllByRole("button", { name: /^Open / })).toHaveLength(14);
  }
);

it("removes an incomplete copy and reports a failed save without opening it", async () => {
  const error = new Error("Save failed");
  update.mockRejectedValue(error);
  showGallery();
  await userEvent.click(
    screen.getByRole("button", { name: "Open Moonlit Tide" })
  );
  await waitFor(() =>
    expect(notify).toHaveBeenCalledWith("add the example sketch", error)
  );
  expect(remove).toHaveBeenCalledWith({
    id: "1234567890abcdef1234567890abcdef"
  });
  expect(openTab).not.toHaveBeenCalled();
  expect(
    screen.getByRole("button", { name: "Open Moonlit Tide" })
  ).toBeEnabled();
});
