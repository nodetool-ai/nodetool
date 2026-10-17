/**
 * @jest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import mockTheme from "../../../__mocks__/themeMock";

const mockUseQuery = jest.fn();
const mockMutate = jest.fn();
const mockRefetch = jest.fn();

jest.mock("../../../trpc/client", () => ({
  trpc: {
    openverse: {
      search: {
        useQuery: (input: unknown, options: unknown) =>
          mockUseQuery(input, options)
      },
      import: {
        useMutation: () => ({ mutate: mockMutate, isPending: false })
      }
    }
  }
}));

jest.mock("../../../serverState/useAssets", () => ({
  __esModule: true,
  default: () => ({
    currentFolderId: "folder-1",
    projectId: "project-1",
    refetchAssetsAndFolders: mockRefetch
  })
}));

jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: <R,>(
    select: (state: { addNotification: () => void }) => R
  ): R => select({ addNotification: jest.fn() })
}));

import OpenverseDialog from "../OpenverseDialog";

const result = (id: string, title: string) => ({
  id,
  media_type: "images" as const,
  title,
  creator: "Jane",
  creator_url: "",
  license: "by",
  license_version: "2.0",
  license_url: "https://creativecommons.org/licenses/by/2.0/",
  attribution: `"${title}" by Jane is licensed under CC BY 2.0.`,
  landing_url: "https://www.flickr.com/photos/x/1",
  source: "flickr",
  url: `https://live.staticflickr.com/${id}.jpg`,
  thumbnail: "",
  filetype: "jpg",
  width: 640,
  height: 480,
  duration_seconds: null
});

const renderDialog = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ThemeProvider theme={mockTheme}>
        <OpenverseDialog open onClose={jest.fn()} />
      </ThemeProvider>
    </QueryClientProvider>
  );

describe("OpenverseDialog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseQuery.mockImplementation((input: { q: string }) =>
      input.q
        ? {
            data: {
              results: [result("a", "Cat"), result("b", "Dog")],
              result_count: 2,
              page: 1,
              page_count: 1,
              authenticated: false
            },
            isLoading: false,
            isFetching: false,
            error: null
          }
        : { data: undefined, isLoading: false, isFetching: false, error: null }
    );
  });

  it("does not search until a query is submitted", () => {
    renderDialog();
    expect(mockUseQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ q: "" }),
      expect.objectContaining({ enabled: false })
    );
    expect(screen.getByText("Search openly licensed media")).toBeTruthy();
  });

  it("shows results with their license and adds the selected ones to the current folder", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText("Search Openverse"), "cat{Enter}");

    expect(mockUseQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        media_type: "images",
        q: "cat",
        license_type: "all",
        category: undefined,
        page: 1
      }),
      expect.objectContaining({ enabled: true })
    );
    const add = screen.getByRole("button", { name: "Add to assets" });
    expect(add.hasAttribute("disabled")).toBe(true);

    await user.click(screen.getByRole("button", { name: "Dog, CC BY 2.0" }));

    await user.click(screen.getByRole("button", { name: "Add 1 to assets" }));
    expect(mockMutate).toHaveBeenCalledWith({
      media_type: "images",
      ids: ["b"],
      parent_id: "folder-1",
      project_id: "project-1"
    });
  });
});
