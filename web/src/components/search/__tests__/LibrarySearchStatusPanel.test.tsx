import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import type { StatusOutput } from "@nodetool-ai/protocol/api-schemas/search.js";

import LibrarySearchStatusPanel from "../LibrarySearchStatusPanel";
import { trpc } from "../../../trpc/client";

jest.mock("../../support/ErrorBanner", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div role="alert">{children}</div>
}));

const statusHook = trpc.search.status.useQuery as unknown as jest.Mock;
const rebuildHook = trpc.search.rebuild.useMutation as unknown as jest.Mock;

const status: StatusOutput = {
  items: { ready: 4, pending: 0, failed: 1, skipped: 0, total: 5 },
  chunks: 20,
  semantic: { space: "transformers_js:Xenova/all-MiniLM-L6-v2", choice: "on", embedded: 18, remaining: 2, collections: ["a"], images: { space: null, embedded: 0, remaining: 0 } },
  failures: [{ item_id: "i1", title: "scan.pdf", error: "The PDF is encrypted." }],
  can_set_up: true,
  local_model: { provider: "transformers_js", model: "Xenova/all-MiniLM-L6-v2", download_megabytes: 91 }
};

beforeEach(() => {
  jest.clearAllMocks();
  statusHook.mockReturnValue({ data: status, isLoading: false, isError: false });
});

it("shows counts, failures with reasons and the model, and rebuilds on request", async () => {
  const mutateAsync = jest.fn(async () => ({ items: 5 }));
  rebuildHook.mockReturnValue({ mutateAsync, isPending: false });
  render(<ThemeProvider theme={mockTheme}><LibrarySearchStatusPanel /></ThemeProvider>);
  expect(screen.getByText("4 of 5 items indexed")).toBeInTheDocument();
  expect(screen.getByText("scan.pdf: The PDF is encrypted.")).toBeInTheDocument();
  expect(screen.getByText(/uses transformers_js:Xenova\/all-MiniLM-L6-v2/)).toBeInTheDocument();
  expect(screen.getByText("18 of 20 passages embedded")).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "Embed again" }));
  expect(mutateAsync).toHaveBeenCalledWith({ scope: "vectors" });
  await userEvent.click(screen.getByRole("button", { name: "Rebuild index" }));
  expect(mutateAsync).toHaveBeenCalledWith({ scope: "all" });
});

it("reports a status that failed to load", () => {
  statusHook.mockReturnValue({ data: undefined, isLoading: false, isError: true });
  render(<ThemeProvider theme={mockTheme}><LibrarySearchStatusPanel /></ThemeProvider>);
  expect(screen.getByRole("alert")).toHaveTextContent("Could not read the library search status.");
});
