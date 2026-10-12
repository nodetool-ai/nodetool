import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Entity } from "@nodetool-ai/protocol";
import mockTheme from "../../../../../__mocks__/themeMock";
import { MentionEntityTile } from "../MentionEntityTile";

const entity = {
  id: "entity-marta",
  kind: "character",
  name: "Marta",
  descriptor: "detective",
  reference_images: [
    { type: "image", uri: "asset://entity-marta.png", asset_id: "entity-marta" }
  ]
} as unknown as Entity;

const renderTile = (value: Entity) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ThemeProvider theme={mockTheme}>
        <MentionEntityTile
          entity={value}
          selected={false}
          onSelect={jest.fn()}
          onMouseEnter={jest.fn()}
        />
      </ThemeProvider>
    </QueryClientProvider>
  );

describe("MentionEntityTile", () => {
  it("never hands an asset:// locator to an <img> as its src", () => {
    const { container } = renderTile(entity);
    expect(screen.getByText("Marta")).toBeInTheDocument();
    for (const img of Array.from(container.querySelectorAll("img"))) {
      expect(img.getAttribute("src") ?? "").not.toMatch(/^asset:\/\//);
    }
  });

  it("shows the kind icon when the entity has no reference image", () => {
    const { container } = renderTile({ ...entity, reference_images: [] });
    expect(container.querySelector(".entity-avatar-icon")).toBeInTheDocument();
    expect(container.querySelector("img")).not.toBeInTheDocument();
  });
});
