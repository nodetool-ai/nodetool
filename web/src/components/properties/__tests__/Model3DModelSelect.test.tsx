import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import mockTheme from "../../../__mocks__/themeMock";
import Model3DModelSelect from "../Model3DModelSelect";

jest.mock("../../../hooks/useModelProviderSetup", () => ({
  useModelProviderSetup: () => ({ openSetup: jest.fn() })
}));

const mockModel3d = jest.fn();
jest.mock("../../../lib/trpc", () => ({
  trpc: { models: { model3d: { query: () => mockModel3d() } } }
}));

it("lists the 3D models the server's models.model3d procedure returns", async () => {
  mockModel3d.mockResolvedValue([
    { id: "meshy-4", name: "Meshy-4 Text-to-3D", provider: "meshy", supported_tasks: ["text_to_3d"] }
  ]);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={mockTheme}>
        <Model3DModelSelect onChange={jest.fn()} value="meshy-4" provider="meshy" />
      </ThemeProvider>
    </QueryClientProvider>
  );
  expect(await screen.findByText("Meshy-4 Text-to-3D")).toBeInTheDocument();
  expect(mockModel3d).toHaveBeenCalledTimes(1);
});

it("ticks only the selected provider's model when two providers share an id", () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } }
  });
  queryClient.setQueryData(
    ["3d-models"],
    [
      { id: "shared", name: "Shared A", provider: "alpha" },
      { id: "shared", name: "Shared B", provider: "beta" }
    ]
  );
  render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={mockTheme}>
        <Model3DModelSelect onChange={jest.fn()} value="shared" provider="beta" />
      </ThemeProvider>
    </QueryClientProvider>
  );

  fireEvent.click(screen.getByText("Shared B"));

  const selected = screen
    .getAllByRole("menuitem")
    .filter((item) => item.classList.contains("Mui-selected"));
  expect(selected.map((item) => item.textContent)).toEqual(["Shared B"]);
});
