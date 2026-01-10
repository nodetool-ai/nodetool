import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import FavoritesTiles from "../FavoritesTiles";
import useFavoriteNodesStore from "../../../stores/FavoriteNodesStore";
import useNodeMenuStore from "../../../stores/NodeMenuStore";
import useMetadataStore from "../../../stores/MetadataStore";
import { useNotificationStore } from "../../../stores/NotificationStore";
import mockTheme from "../../../__mocks__/themeMock";

jest.mock("../../../stores/FavoriteNodesStore");
jest.mock("../../../stores/NodeMenuStore");
jest.mock("../../../stores/MetadataStore");
jest.mock("../../../stores/NotificationStore");
jest.mock("../../../hooks/useCreateNode");
jest.mock("../../../lib/dragdrop/store");
jest.mock("../../../lib/dragdrop");

const mockGetMetadata = jest.fn((nodeType: string) => {
  console.log("mockGetMetadata called with:", nodeType);
  if (nodeType === "nodetool.text.Prompt") {
    return {
      node_type: "nodetool.text.Prompt",
      title: "Prompt",
      namespace: "nodetool.text",
      description: "A prompt node",
      tags: ["text"],
      expose_as_tool: false,
      inputs: [],
      outputs: [{ name: "output", type: "text" }],
      properties: {},
    };
  }
  if (nodeType === "nodetool.image.GenerateImage") {
    return {
      node_type: "nodetool.image.GenerateImage",
      title: "Generate Image",
      namespace: "nodetool.image",
      description: "Generate an image",
      tags: ["image"],
      expose_as_tool: false,
      inputs: [],
      outputs: [{ name: "output", type: "image" }],
      properties: {},
    };
  }
  return null;
});

const renderWithTheme = (component: React.ReactNode) => {
  return render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);
};

describe("FavoritesTiles", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (useFavoriteNodesStore as unknown as jest.Mock).mockImplementation(
      (selector: any) => {
        const state = {
          favorites: [
            { nodeType: "nodetool.text.Prompt", timestamp: Date.now() },
            { nodeType: "nodetool.image.GenerateImage", timestamp: Date.now() - 1000 },
          ],
          removeFavorite: jest.fn(),
          clearFavorites: jest.fn(),
        };
        return selector(state);
      }
    );

    (useNodeMenuStore as unknown as jest.Mock).mockImplementation(() => ({
      setDragToCreate: jest.fn(),
      setHoveredNode: jest.fn(),
    }));

    (useMetadataStore as unknown as jest.Mock).mockImplementation((selector: any) =>
      selector({ getMetadata: mockGetMetadata })
    );

    (useNotificationStore as unknown as jest.Mock).mockImplementation((selector: any) =>
      selector({ addNotification: jest.fn() })
    );
  });

  it("renders favorites section when favorites exist", () => {
    renderWithTheme(<FavoritesTiles />);

    expect(screen.getByText("Favorites")).toBeInTheDocument();
  });

  it("displays all favorite nodes with their titles", () => {
    renderWithTheme(<FavoritesTiles />);

    expect(screen.getByText("Prompt")).toBeInTheDocument();
    expect(screen.getByText("Generate Image")).toBeInTheDocument();
  });

  it("shows clear all button", () => {
    renderWithTheme(<FavoritesTiles />);

    expect(screen.getByLabelText("Clear all favorites")).toBeInTheDocument();
  });

  it("does not render when no favorites exist", () => {
    (useFavoriteNodesStore as unknown as jest.Mock).mockImplementation(
      (selector: any) => {
        const state = {
          favorites: [],
          removeFavorite: jest.fn(),
          clearFavorites: jest.fn(),
        };
        return selector(state);
      }
    );

    const { container } = renderWithTheme(<FavoritesTiles />);
    expect(container).toBeEmptyDOMElement();
  });

  it("has unfavorite button available on tile", () => {
    renderWithTheme(<FavoritesTiles />);

    const unfavoriteBtn = screen.getByLabelText("Remove Prompt from favorites");
    expect(unfavoriteBtn).toBeInTheDocument();
  });

  it("unfavorite button calls removeFavorite with correct node type", async () => {
    const user = userEvent.setup();
    const removeFavorite = jest.fn();

    (useFavoriteNodesStore as unknown as jest.Mock).mockImplementation(
      (selector: any) => {
        const state = {
          favorites: [
            { nodeType: "nodetool.text.Prompt", timestamp: Date.now() },
          ],
          removeFavorite,
          clearFavorites: jest.fn(),
        };
        return selector(state);
      }
    );

    renderWithTheme(<FavoritesTiles />);

    const unfavoriteBtn = screen.getByLabelText("Remove Prompt from favorites");
    await user.click(unfavoriteBtn);

    expect(removeFavorite).toHaveBeenCalledWith("nodetool.text.Prompt");
  });

  it("clicking clear all button clears all favorites", async () => {
    const user = userEvent.setup();
    const clearFavorites = jest.fn();

    (useFavoriteNodesStore as unknown as jest.Mock).mockImplementation(
      (selector: any) => {
        const state = {
          favorites: [
            { nodeType: "nodetool.text.Prompt", timestamp: Date.now() },
          ],
          removeFavorite: jest.fn(),
          clearFavorites,
        };
        return selector(state);
      }
    );

    renderWithTheme(<FavoritesTiles />);

    const clearBtn = screen.getByLabelText("Clear all favorites");
    await user.click(clearBtn);

    expect(clearFavorites).toHaveBeenCalled();
  });

  it("displays nodes in a grid layout", () => {
    renderWithTheme(<FavoritesTiles />);

    const tilesContainer = document.querySelector(".tiles-container");
    expect(tilesContainer).toBeInTheDocument();
    expect(tilesContainer).toHaveStyle({ display: "grid" });
  });

  it("has interactive tiles that can be hovered", async () => {
    const user = userEvent.setup();

    renderWithTheme(<FavoritesTiles />);

    const tile = screen.getByText("Prompt").closest(".favorite-tile");
    expect(tile).toBeInTheDocument();

    await user.hover(tile!);

    const unfavoriteBtn = screen.getByLabelText("Remove Prompt from favorites");
    expect(unfavoriteBtn).toBeInTheDocument();
  });

  it("handles missing metadata by showing node type", () => {
    (useFavoriteNodesStore as unknown as jest.Mock).mockImplementation(
      (selector: any) => {
        const state = {
          favorites: [
            { nodeType: "unknown.node.Type", timestamp: Date.now() },
          ],
          removeFavorite: jest.fn(),
          clearFavorites: jest.fn(),
        };
        return selector(state);
      }
    );

    renderWithTheme(<FavoritesTiles />);

    expect(screen.getByText("Type")).toBeInTheDocument();
  });
});
