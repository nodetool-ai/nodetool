import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import DashboardTemplates from "../DashboardTemplates";
import type { Workflow } from "../../../stores/ApiTypes";

const loadTemplates = jest.fn();
const handleExampleClick = jest.fn();
const handleViewAllTemplates = jest.fn();

jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  __esModule: true,
  useWorkflowManager: <T,>(selector: (s: { loadTemplates: unknown }) => T) =>
    selector({ loadTemplates: (...args: unknown[]) => loadTemplates(...args) })
}));

jest.mock("../../../hooks/useWorkflowActions", () => ({
  __esModule: true,
  useWorkflowActions: () => ({
    handleExampleClick,
    handleViewAllTemplates,
    loadingExampleId: null
  })
}));

jest.mock("../../../stores/KeyPressedStore", () => ({
  __esModule: true,
  useGlobalCombo: () => {}
}));

const template = (
  id: string,
  name: string,
  tags: string[],
  thumbnailUrl: string | null = null
): Workflow =>
  ({
    id,
    name,
    description: `${name} description`,
    tags,
    thumbnail_url: thumbnailUrl,
    access: "public",
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    graph: { nodes: [], edges: [] }
  }) as unknown as Workflow;

const TEMPLATES = [
  template("t1", "Image upscaler", ["image"], "/api/thumb/upscaler.jpg?v=1"),
  template("t2", "Podcast cutter", ["audio"]),
  template("t3", "Web researcher", ["research"])
];

const renderTemplates = () => {
  loadTemplates.mockResolvedValue({ workflows: TEMPLATES, next: null });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={mockTheme}>
        <DashboardTemplates />
      </ThemeProvider>
    </QueryClientProvider>
  );
};

describe("DashboardTemplates", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("lists each template as a row carrying its description", async () => {
    renderTemplates();

    const row = await screen.findByRole("button", { name: /image upscaler/i });
    expect(within(row).getByText("Image upscaler description")).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /podcast cutter/i })
    ).toBeInTheDocument();
  });

  it("opens the template that was clicked", async () => {
    const user = userEvent.setup();
    renderTemplates();

    await user.click(
      await screen.findByRole("button", { name: /web researcher/i })
    );

    expect(handleExampleClick).toHaveBeenCalledWith(
      expect.objectContaining({ id: "t3" })
    );
  });

  // The server sets thumbnail_url only when the image exists, so a row that
  // requests one anyway logs a 404 — which fails the docker smoke check.
  it("requests a thumbnail only for templates that have one", async () => {
    renderTemplates();

    const withThumb = await screen.findByRole("button", {
      name: /image upscaler/i
    });
    expect(withThumb.querySelector("img")).toHaveAttribute(
      "src",
      expect.stringContaining("/api/thumb/upscaler.jpg?v=1")
    );

    const withoutThumb = screen.getByRole("button", {
      name: /podcast cutter/i
    });
    expect(withoutThumb.querySelector("img")).toBeNull();
  });

  it("narrows the list to the selected category", async () => {
    const user = userEvent.setup();
    renderTemplates();

    await screen.findByRole("button", { name: /image upscaler/i });
    await user.click(screen.getByRole("button", { name: "Audio" }));

    expect(
      screen.getByRole("button", { name: /podcast cutter/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /image upscaler/i })
    ).not.toBeInTheDocument();
  });
});
