import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import CollectionForm from "../CollectionForm";

const createCollection = jest.fn().mockResolvedValue({ id: "collection-1" });
jest.mock("../../../trpc/client", () => ({
  trpcClient: {
    collections: { create: { mutate: (...args: unknown[]) => createCollection(...args) } }
  }
}));
jest.mock("../../properties/EmbeddingModelSelect", () => ({
  __esModule: true,
  default: ({
    onChange,
    provider
  }: {
    onChange: (value: { type: string; id: string; provider: string }) => void;
    provider?: string;
  }) => (
    <button
      type="button"
      onClick={() =>
        onChange({ type: "embedding_model", id: "shared", provider: "second" })
      }
    >
      Embedding provider: {provider ?? "none"}
    </button>
  )
}));

it("keeps the selected embedding provider when creating a collection", async () => {
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={mockTheme}>
        <CollectionForm onClose={jest.fn()} />
      </ThemeProvider>
    </QueryClientProvider>
  );

  fireEvent.change(screen.getByPlaceholderText("my-collection"), {
    target: { value: "My collection" }
  });
  fireEvent.click(screen.getByRole("button", { name: /embedding provider/i }));
  expect(screen.getByRole("button", { name: /embedding provider: second/i })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Create" }));

  await waitFor(() => {
    expect(createCollection).toHaveBeenCalledWith({
      name: "My collection",
      embedding_model: "shared",
      embedding_provider: "second"
    });
  });
});
