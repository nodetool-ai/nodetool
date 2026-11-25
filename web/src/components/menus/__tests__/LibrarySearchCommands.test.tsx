import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { Command } from "cmdk";
import type { QueryOutput, StatusOutput } from "@nodetool-ai/protocol/api-schemas/search.js";

import LibrarySearchCommands from "../LibrarySearchCommands";
import { trpc } from "../../../trpc/client";
import { openResource } from "../../../lib/chat/openResource";
import { openSettingsTab } from "../../workspace/openPageTab";

jest.mock("../../../lib/chat/openResource", () => ({ openResource: jest.fn() }));
jest.mock("../../workspace/openPageTab", () => ({ openSettingsTab: jest.fn() }));
jest.mock("../../../hooks/useProjects", () => ({
  useProjects: () => ({ data: [{ id: "p1", name: "Harbour film" }] })
}));
jest.mock("../../../utils/browser", () => ({ isElectron: true }));
jest.mock("../../ui_primitives", () => {
  const actual = jest.requireActual("../../ui_primitives");
  return { ...actual, ResponsiveImage: ({ alt }: { alt: string }) => <img alt={alt} data-testid="thumbnail" /> };
});

const queryHook = trpc.search.query.useQuery as unknown as jest.Mock;
const statusHook = trpc.search.status.useQuery as unknown as jest.Mock;
const setupHook = trpc.search.setup.useMutation as unknown as jest.Mock;

const status = (overrides: Partial<StatusOutput> = {}): StatusOutput => ({
  items: { ready: 3, pending: 0, failed: 0, skipped: 0, total: 3 },
  chunks: 12,
  semantic: { space: null, choice: "on", embedded: 0, remaining: 0, collections: [] },
  failures: [],
  can_set_up: true,
  local_model: { provider: "transformers_js", model: "Xenova/all-MiniLM-L6-v2", download_megabytes: 91 },
  ...overrides
});

const answer = (hits: QueryOutput["hits"]): QueryOutput => ({
  hits,
  next_cursor: null,
  total: hits.length,
  index: { mode: "keyword", pending: 0, failed: 0 }
});

const hit: QueryOutput["hits"][number] = {
  item_id: "item-1",
  resource_type: "asset",
  resource_id: "asset-1",
  kind: "document",
  title: "logbook.txt",
  project_id: "p1",
  folder_path: "Notes",
  content_type: "text/plain",
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
  matches: [{ field: "body", snippet: "The lighthouse keeper logged every ship", locator: null }]
};

const Group = ({ search }: { search: string }) => (
  <ThemeProvider theme={mockTheme}>
    <Command shouldFilter>
      <Command.List>
        <LibrarySearchCommands search={search} />
      </Command.List>
    </Command>
  </ThemeProvider>
);

const renderGroup = (search: string) => render(<Group search={search} />);

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: jest.fn() });
});

beforeEach(() => {
  jest.clearAllMocks();
  queryHook.mockReturnValue({ data: undefined, isFetching: false, isError: false });
  statusHook.mockReturnValue({ data: status(), isLoading: false, isError: false });
});

it("shows a hit with its passage and location, and opens it on select", async () => {
  queryHook.mockReturnValue({ data: answer([hit]), isFetching: false, isError: false });
  renderGroup("lighthouse");
  expect(await screen.findByText("logbook.txt")).toBeInTheDocument();
  expect(screen.getByText("The lighthouse keeper logged every ship")).toBeInTheDocument();
  expect(screen.getByText("Harbour film / Notes")).toBeInTheDocument();
  await userEvent.click(screen.getByText("logbook.txt"));
  expect(openResource).toHaveBeenCalledWith({ kind: "asset", id: "asset-1" });
});

it("names the scope when nothing matches", async () => {
  queryHook.mockReturnValue({ data: answer([]), isFetching: false, isError: false });
  renderGroup("zebra");
  expect(await screen.findByTestId("library-no-match")).toHaveTextContent("Searched every project");
});

it("says how much is left while the index has work", () => {
  statusHook.mockReturnValue({
    data: status({ items: { ready: 1, pending: 2, failed: 0, skipped: 0, total: 3 } }),
    isLoading: false,
    isError: false
  });
  renderGroup("");
  expect(screen.getByTestId("library-index-status")).toHaveTextContent("1 of 3");
});

it("offers search by meaning once, on an empty search, until someone chooses", async () => {
  const mutateAsync = jest.fn();
  setupHook.mockReturnValue({ mutateAsync, isPending: false, error: null });
  statusHook.mockReturnValue({
    data: status({ semantic: { space: null, choice: "unset", embedded: 0, remaining: 0, collections: [] } }),
    isLoading: false,
    isError: false
  });
  const { rerender } = renderGroup("");
  expect(screen.getByText("Download the local model (91 MB)")).toBeInTheDocument();
  expect(screen.getByText(/sent to the provider you choose: 12/)).toBeInTheDocument();

  await userEvent.click(screen.getByText("Download the local model (91 MB)"));
  expect(mutateAsync).toHaveBeenCalledWith({
    model: { provider: "transformers_js", model: "Xenova/all-MiniLM-L6-v2" }
  });
  await userEvent.click(screen.getByText("Not now"));
  expect(mutateAsync).toHaveBeenCalledWith({ model: null });
  await userEvent.click(screen.getByText("Use a provider model"));
  expect(openSettingsTab).toHaveBeenCalledWith("integrations");

  rerender(<Group search="fox" />);
  expect(screen.queryByText("Not now")).not.toBeInTheDocument();
});
