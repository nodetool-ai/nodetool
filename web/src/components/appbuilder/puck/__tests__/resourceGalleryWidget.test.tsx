import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { ResourceBinding } from "@nodetool-ai/app-runtime";

import mockTheme from "../../../../__mocks__/themeMock";
import { makeTestRuntime } from "../../__tests__/testRuntime";

const ITEMS = [
  {
    ref: { kind: "asset" as const, id: "a1" },
    name: "Sunset",
    projectId: null,
    contentType: "image/png",
    updatedAt: "2026-07-01T00:00:00.000Z"
  },
  {
    ref: { kind: "asset" as const, id: "a2" },
    name: "Harbour",
    projectId: null,
    contentType: "image/png",
    updatedAt: "2026-07-02T00:00:00.000Z"
  }
];

const listQuery = jest.fn(() => ({ data: ITEMS, isLoading: false }));

jest.mock("../../../../trpc/client", () => ({
  trpc: {
    useUtils: () => ({ resources: { read: { setData: jest.fn(), invalidate: jest.fn() } } }),
    resources: {
      list: { useQuery: () => listQuery() },
      read: { useQuery: () => ({ data: undefined, isLoading: false }) },
      update: { useMutation: () => ({ mutate: jest.fn(), isPending: false, error: null }) }
    },
    assets: {
      get: {
        useQuery: () => ({
          data: { thumb_url: "https://example.test/thumb.png", get_url: null }
        })
      }
    }
  }
}));

import { ResourceGalleryWidget } from "../ResourceGalleryWidget";

const BINDING: ResourceBinding = {
  id: "rb1",
  name: "Shots",
  kind: "asset",
  scope: { projectId: "default" },
  operations: ["read"]
};

const renderGallery = () => {
  const selectResource = jest.fn();
  const { wrapper: Wrapper } = makeTestRuntime(
    {},
    { resources: [BINDING], selectResource }
  );
  render(
    <ThemeProvider theme={mockTheme}>
      <Wrapper>
        <ResourceGalleryWidget id="g1" resourceBindingId="rb1" label="Shots" />
      </Wrapper>
    </ThemeProvider>
  );
  return { selectResource };
};

beforeEach(() => jest.clearAllMocks());

describe("ResourceGalleryWidget", () => {
  it("renders every member of the bound collection as a tile", () => {
    renderGallery();

    expect(screen.getByRole("listbox", { name: "Shots" })).toBeInTheDocument();
    const options = screen.getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["Sunset", "Harbour"]);
  });

  it("points the binding at the tile the user clicks", async () => {
    const user = userEvent.setup();
    const { selectResource } = renderGallery();

    await user.click(screen.getByRole("option", { name: "Harbour" }));

    expect(selectResource).toHaveBeenLastCalledWith("rb1", {
      kind: "asset",
      id: "a2"
    });
    expect(screen.getByRole("option", { name: "Harbour" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  it("is reachable and selectable from the keyboard alone", async () => {
    const user = userEvent.setup();
    const { selectResource } = renderGallery();

    // One tab stop for the grid, arrows to move within it.
    await user.tab();
    expect(screen.getByRole("option", { name: "Sunset" })).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("option", { name: "Harbour" })).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(selectResource).toHaveBeenLastCalledWith("rb1", {
      kind: "asset",
      id: "a2"
    });
  });

  it("says so when the collection is empty", () => {
    listQuery.mockReturnValueOnce({ data: [], isLoading: false });
    renderGallery();

    expect(screen.getByText(/No asset resources/)).toBeInTheDocument();
  });
});
