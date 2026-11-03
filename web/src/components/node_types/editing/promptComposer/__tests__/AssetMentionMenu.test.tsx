import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Entity } from "@nodetool-ai/protocol";
import mockTheme from "../../../../../__mocks__/themeMock";
import { AssetMentionMenu } from "../AssetMentionMenu";

const marta = {
  type: "entity",
  id: "e1",
  kind: "character",
  name: "Marta",
  descriptor: "detective"
} as unknown as Entity;

const renderMenu = (props: {
  entities: Entity[];
  entitiesOnly?: boolean;
}) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ThemeProvider theme={mockTheme}>
        <AssetMentionMenu
          activeTab="saved"
          onTabChange={jest.fn()}
          assets={[]}
          selectedIndex={0}
          onSelect={jest.fn()}
          onHighlight={jest.fn()}
          onRename={jest.fn()}
          queryString="mar"
          {...props}
        />
      </ThemeProvider>
    </QueryClientProvider>
  );

describe("AssetMentionMenu", () => {
  it("shows the asset tabs beside the entities by default", () => {
    renderMenu({ entities: [marta] });
    expect(screen.getByText("Marta")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Saved" })).toBeInTheDocument();
  });

  it("drops the asset tabs and grid when it lists entities only", () => {
    renderMenu({ entities: [marta], entitiesOnly: true });
    expect(screen.getByText("Marta")).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.queryByText("No assets match.")).not.toBeInTheDocument();
  });

  it("says no entity matches when entities only finds none", () => {
    renderMenu({ entities: [], entitiesOnly: true });
    expect(screen.getByText("No entities match.")).toBeInTheDocument();
  });
});
