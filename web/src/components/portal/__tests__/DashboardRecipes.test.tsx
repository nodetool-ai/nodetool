import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import DashboardRecipes from "../DashboardRecipes";

const useQuery = jest.fn();
const openStep = jest.fn();
const addRecipe = jest.fn();

jest.mock("../../../trpc/client", () => ({
  __esModule: true,
  trpc: { workflows: { recipes: { useQuery: (...args: unknown[]) => useQuery(...args) } } }
}));

jest.mock("../../../hooks/useRecipeActions", () => ({
  __esModule: true,
  useRecipeActions: () => ({
    copyingStep: null,
    addingSlug: null,
    openStep: (...args: unknown[]) => openStep(...args),
    addRecipe: (...args: unknown[]) => addRecipe(...args)
  })
}));

const step = (example: string, role: string, models: string[] = []) => ({
  example,
  exampleId: `${example}.json`,
  packageName: "nodetool-base",
  description: `${example} description`,
  role,
  handoff: `${role} handoff`,
  thumbnailUrl: null,
  nodeCount: 4,
  models: models.map((model) => ({ provider: "fal_ai", model })),
  alternative: null
});

const RECIPE = {
  slug: "viral-video-ad-engine",
  name: "Viral Video Ad Engine",
  outcome: "A vertical product ad.",
  audience: "Performance teams.",
  summary: ["Ordered cheapest first."],
  caveats: ["Nothing here measures performance."],
  thumbnailUrl: "/api/thumb/hook.jpg?v=1",
  providers: ["fal_ai"],
  nodeCount: 8,
  steps: [
    step("Ad Copy in Three Registers", "Settle the register"),
    step("Ad Loop from a Product Photo", "Put the product in motion", [
      "fal-ai/kling"
    ])
  ]
};

const renderRecipes = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <DashboardRecipes />
    </ThemeProvider>
  );

describe("DashboardRecipes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useQuery.mockReturnValue({
      data: [RECIPE],
      isLoading: false,
      isError: false,
      refetch: jest.fn()
    });
  });

  it("lists each recipe with the size of its chain", () => {
    renderRecipes();
    expect(screen.getByText("Viral Video Ad Engine")).toBeInTheDocument();
    expect(screen.getByText("A vertical product ad.")).toBeInTheDocument();
    expect(screen.getByText("2 workflows · 8 nodes")).toBeInTheDocument();
    // The chain stays collapsed until asked for.
    expect(screen.queryByText(/Settle the register/)).not.toBeInTheDocument();
  });

  it("opens the chain and copies a step on click", async () => {
    const user = userEvent.setup();
    renderRecipes();

    await user.click(
      screen.getByRole("button", { name: /Viral Video Ad Engine/ })
    );
    expect(screen.getByText("Ordered cheapest first.")).toBeInTheDocument();
    expect(
      screen.getByText("Nothing here measures performance.")
    ).toBeInTheDocument();

    const stepButton = screen.getByRole("button", {
      name: /Ad Loop from a Product Photo/
    });
    expect(within(stepButton).getByText("fal-ai/kling")).toBeInTheDocument();
    await user.click(stepButton);
    expect(openStep).toHaveBeenCalledWith(
      "viral-video-ad-engine",
      expect.objectContaining({ example: "Ad Loop from a Product Photo" })
    );
  });

  it("says a step needs no key when its graph names no model", async () => {
    const user = userEvent.setup();
    renderRecipes();
    await user.click(
      screen.getByRole("button", { name: /Viral Video Ad Engine/ })
    );
    expect(
      screen.getByText("Runs locally — no key needed")
    ).toBeInTheDocument();
  });

  it("adds the whole chain from the header button", async () => {
    const user = userEvent.setup();
    renderRecipes();
    await user.click(screen.getByRole("button", { name: "Add all 2" }));
    expect(addRecipe).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "viral-video-ad-engine" })
    );
  });

  it("renders nothing when the install ships no recipes", () => {
    useQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn()
    });
    const { container } = renderRecipes();
    expect(container).toBeEmptyDOMElement();
  });
});
