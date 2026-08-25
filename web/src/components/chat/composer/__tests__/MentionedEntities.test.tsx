import React from "react";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { Entity } from "@nodetool-ai/protocol";

import { MentionedEntities } from "../MentionedEntities";
import mockTheme from "../../../../__mocks__/themeMock";
import { stub } from "../../../../test-utils/doubles";

const ENTITIES = stub<Entity[]>([
  {
    type: "entity",
    id: "e1",
    kind: "character",
    name: "Marta",
    descriptor: "red-haired detective"
  },
  {
    type: "entity",
    id: "e2",
    kind: "location",
    name: "The Pier",
    descriptor: "a rotting boardwalk"
  }
]);

const mockUseEntities = jest.fn();

jest.mock("../../../../serverState/useEntities", () => ({
  useEntities: () => mockUseEntities()
}));

const renderRow = (value: string, setValue = jest.fn()) => {
  render(
    <ThemeProvider theme={mockTheme}>
      <MentionedEntities value={value} setValue={setValue} />
    </ThemeProvider>
  );
  return setValue;
};

describe("MentionedEntities", () => {
  beforeEach(() => {
    mockUseEntities.mockReturnValue({ data: ENTITIES });
  });

  it("renders nothing when the prompt references no entity", () => {
    renderRow("just a prompt");
    expect(screen.queryByTestId("mentioned-entities")).toBeNull();
  });

  it("names each entity the prompt references, in order", () => {
    renderRow("entity://e2 at night with entity://e1");

    expect(screen.getByText("The Pier")).toBeInTheDocument();
    expect(screen.getByText("Marta")).toBeInTheDocument();
  });

  it("shows one chip when the same entity is mentioned twice", () => {
    renderRow("entity://e1 waves at entity://e1");
    expect(screen.getAllByText("Marta")).toHaveLength(1);
  });

  it("skips an id with no entity behind it", () => {
    renderRow("entity://gone");
    expect(screen.queryByTestId("mentioned-entities")).toBeNull();
  });

  it("removing a chip strips that entity's tokens from the prompt", async () => {
    const user = userEvent.setup();
    const setValue = renderRow("a shot of entity://e1 at entity://e2");

    // MUI's Chip delete affordance; the first chip is Marta's.
    await user.click(screen.getAllByTestId("CancelIcon")[0]);

    expect(setValue).toHaveBeenCalledWith("a shot of at entity://e2");
  });
});
