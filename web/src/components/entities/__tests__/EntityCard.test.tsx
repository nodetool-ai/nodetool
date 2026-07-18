/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import type { Entity } from "@nodetool-ai/protocol";

// The image ladder eventually mounts AssetViewer (react-router `useNavigate`),
// which is irrelevant here — stub the preview.
jest.mock("../../node/ImageRefPreview", () => ({
  __esModule: true,
  default: () => null
}));

import EntityCard from "../EntityCard";

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>);

const entity: Entity = {
  type: "entity",
  id: "asset-1",
  kind: "character",
  name: "Mara",
  descriptor: "a tall woman with red hair and a green coat",
  reference_images: [
    { type: "image", asset_id: "asset-1", uri: "http://example/a.png" }
  ]
};

describe("EntityCard", () => {
  it("renders the name, kind, and descriptor", () => {
    renderWithTheme(<EntityCard entity={entity} />);
    expect(screen.getByText("Mara")).toBeInTheDocument();
    expect(screen.getByText("character")).toBeInTheDocument();
    expect(
      screen.getByText("a tall woman with red hair and a green coat")
    ).toBeInTheDocument();
  });
});
