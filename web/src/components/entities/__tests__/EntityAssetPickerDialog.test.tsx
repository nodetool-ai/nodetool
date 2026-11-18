/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import mockTheme from "../../../__mocks__/themeMock";
import { useWorkspaceTabsStore } from "../../../stores/WorkspaceTabsStore";

jest.mock("../../node/ImageRefPreview", () => ({
  __esModule: true,
  default: () => null
}));

const mockSearch = jest.fn();
const mockCopy = jest.fn();

jest.mock("../../../trpc/client", () => ({
  trpcClient: {
    assets: {
      search: { query: (input: unknown) => mockSearch(input) },
      copyToProject: { mutate: (input: unknown) => mockCopy(input) }
    }
  }
}));

import EntityAssetPickerDialog from "../EntityAssetPickerDialog";

const PROJECT_A = "project-a";
const PERSONAL = "personal-1";

const image = (id: string, name: string) => ({
  id,
  name,
  content_type: "image/png",
  thumb_url: null,
  get_url: null
});

const LISTS: Record<string, ReturnType<typeof image>[]> = {
  [PROJECT_A]: [image("own-1", "Own still")],
  [PERSONAL]: [image("lib-1", "Library fox")]
};

function renderPicker(onPick: (id: string) => void) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={mockTheme}>
        <EntityAssetPickerDialog open onClose={() => {}} onPick={onPick} />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

describe("EntityAssetPickerDialog in a named project", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearch.mockImplementation(async ({ project_id }: { project_id: string }) => ({
      assets: LISTS[project_id] ?? []
    }));
    mockCopy.mockResolvedValue({
      asset: image("copy-1", "Library fox"),
      copied: true
    });
    useWorkspaceTabsStore.setState({
      activeProjectId: PROJECT_A,
      personalProjectId: PERSONAL
    });
  });

  it("hands over the project's own image as it is", async () => {
    const onPick = jest.fn();
    renderPicker(onPick);

    await userEvent.click(
      await screen.findByRole("button", { name: /Own still/ })
    );

    expect(onPick).toHaveBeenCalledWith("own-1");
    expect(mockCopy).not.toHaveBeenCalled();
  });

  it("copies an image picked from Personal into the project and hands over the copy's id", async () => {
    const onPick = jest.fn();
    renderPicker(onPick);

    await userEvent.click(await screen.findByRole("tab", { name: "Personal" }));
    expect(
      screen.getByText("Picking from Personal copies the file into this project.")
    ).toBeInTheDocument();
    await userEvent.click(
      await screen.findByRole("button", { name: /Library fox/ })
    );

    await waitFor(() => expect(onPick).toHaveBeenCalledWith("copy-1"));
    expect(mockCopy).toHaveBeenCalledWith({
      asset_id: "lib-1",
      project_id: PROJECT_A
    });
    expect(mockSearch).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: PERSONAL })
    );
  });

  it("reports a failed copy and hands over nothing", async () => {
    mockCopy.mockRejectedValue(new Error("Project folder not found"));
    const onPick = jest.fn();
    renderPicker(onPick);

    await userEvent.click(await screen.findByRole("tab", { name: "Personal" }));
    await userEvent.click(
      await screen.findByRole("button", { name: /Library fox/ })
    );

    expect(
      await screen.findByText("Could not copy the asset into this project.")
    ).toBeInTheDocument();
    expect(onPick).not.toHaveBeenCalled();
  });

  it("shows one list without tabs in Personal itself", async () => {
    useWorkspaceTabsStore.setState({ activeProjectId: PERSONAL });
    renderPicker(jest.fn());

    expect(
      await screen.findByRole("button", { name: /Library fox/ })
    ).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Personal" })).not.toBeInTheDocument();
  });
});
