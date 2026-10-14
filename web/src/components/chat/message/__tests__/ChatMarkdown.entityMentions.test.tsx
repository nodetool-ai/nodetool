import React from "react";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import ChatMarkdown from "../ChatMarkdown";
import mockTheme from "../../../../__mocks__/themeMock";

const mockUseAssetById = jest.fn();

jest.mock("../../../../serverState/useAssetById", () => ({
  useAssetById: (...args: unknown[]) => mockUseAssetById(...args)
}));

jest.mock("../../../../trpc/client", () => ({
  trpc: {
    storage: {
      signUrl: {
        useQuery: () => ({ data: undefined })
      }
    }
  }
}));

jest.mock("../../../../hooks/useResolvedMediaUri");

jest.mock("../../../../lib/chat/openResource", () => ({
  __esModule: true,
  openResource: jest.fn(),
  canOpenResource: () => false
}));

/**
 * react-markdown is ESM-only and globally mocked as a passthrough. This
 * stand-in does what the branch under test needs: pull `[label](href)` out of
 * the text, run the href through `urlTransform` the way react-markdown does,
 * and hand what survives to `components.a`. The bare-token half of the feature
 * is the remark plugin, covered in `remarkEntityMentions.test.ts`.
 */
jest.mock("react-markdown", () => ({
  __esModule: true,
  ...jest.requireActual("../../../../__mocks__/linkedMarkdownMock")
}));

const renderMarkdown = (content: string) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ChatMarkdown content={content} />
    </ThemeProvider>
  );

describe("ChatMarkdown entity mentions", () => {
  beforeEach(() => {
    mockUseAssetById.mockReturnValue({
      data: {
        id: "ent1",
        thumb_url: "https://cdn.test/ent1-thumb.png",
        metadata: {
          nodetool_entity: {
            kind: "character",
            name: "Marta",
            descriptor: "a tall woman in a red coat"
          }
        }
      }
    });
  });

  it("renders an entity:// link as a chip carrying the entity's name", () => {
    renderMarkdown("A shot of [ent1](entity://ent1) at dusk.");

    expect(screen.getByText("Marta")).toBeInTheDocument();
    expect(screen.queryByText("entity://ent1")).toBeNull();
    // The chip replaces the anchor — an entity URI has nowhere to navigate.
    expect(screen.getByText("Marta").closest("a")).toBeNull();
  });

  it("resolves the entity live, so a rename shows on an old message", () => {
    mockUseAssetById.mockReturnValue({
      data: {
        id: "ent1",
        metadata: {
          nodetool_entity: {
            kind: "character",
            name: "Marta Reyes",
            descriptor: "a tall woman in a red coat"
          }
        }
      }
    });
    renderMarkdown("[ent1](entity://ent1)");

    expect(screen.getByText("Marta Reyes")).toBeInTheDocument();
  });

  it("falls back to the link text when the entity cannot be read", () => {
    mockUseAssetById.mockReturnValue({ data: undefined });
    renderMarkdown("[ent1](entity://ent1)");

    expect(screen.getByText("ent1")).toBeInTheDocument();
  });
});
