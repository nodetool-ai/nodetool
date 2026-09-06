import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Entity } from "@nodetool-ai/protocol";
import mockTheme from "../../../__mocks__/themeMock";

const assetSearch = jest.fn();
jest.mock("../../../trpc/client", () => ({
  trpcClient: {
    assets: {
      search: {
        query: (...args: unknown[]) => assetSearch(...args)
      }
    }
  }
}));

const mockUseEntities = jest.fn();
jest.mock("../../../serverState/useEntities", () => ({
  useEntities: () => mockUseEntities()
}));

jest.mock("../../node/ImageRefPreview", () => ({
  __esModule: true,
  default: () => <div data-testid="image-preview" />
}));

import EntityProperty from "../EntityProperty";

const nova: Entity = {
  type: "entity",
  id: "asset-nova",
  kind: "character",
  name: "Nova",
  descriptor: "a woman in her thirties, short dark hair"
};

const studio: Entity = {
  type: "entity",
  id: "asset-studio",
  kind: "location",
  name: "Studio",
  descriptor: "a white cyclorama"
};

const assetFor = (entity: Entity) => ({
  id: entity.id,
  name: entity.name,
  content_type: "image/png",
  get_url: `/api/storage/${entity.id}.png`,
  thumb_url: `/api/storage/${entity.id}.png`
});

const renderProperty = (
  overrides: {
    listType?: boolean;
    value?: Entity | Entity[] | null;
    onChange?: jest.Mock;
  } = {}
) => {
  const onChange = overrides.onChange ?? jest.fn();
  const entityType = { type: "entity", optional: false, type_args: [] };
  const type = overrides.listType
    ? { type: "list", optional: false, type_args: [entityType] }
    : entityType;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={mockTheme}>
        <EntityProperty
          property={{
            name: "entities",
            type,
            default: null,
            title: "Entities",
            description: "Entities injected into the prompt.",
            required: false
          }}
          nodeType="nodetool.image.TextToImage"
          nodeId="text_to_image"
          propertyIndex="0"
          value={overrides.value ?? null}
          onChange={onChange}
        />
      </ThemeProvider>
    </QueryClientProvider>
  );
  return { onChange };
};

describe("EntityProperty", () => {
  beforeEach(() => {
    mockUseEntities.mockReturnValue({ data: [nova, studio] });
    assetSearch.mockResolvedValue({
      assets: [assetFor(nova), assetFor(studio)]
    });
  });

  it("shows the library entities in the picker", async () => {
    const user = userEvent.setup();
    renderProperty();

    await user.click(screen.getByRole("button", { name: /pick entity/i }));

    expect(await screen.findByRole("button", { name: "Nova" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Studio" })).toBeInTheDocument();
  });

  it("writes the whole Entity object for a single-value property", async () => {
    const user = userEvent.setup();
    const { onChange } = renderProperty();

    await user.click(screen.getByRole("button", { name: /pick entity/i }));
    await user.click(await screen.findByRole("button", { name: "Nova" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(nova);
  });

  it("appends to the array for a list[entity] property", async () => {
    const user = userEvent.setup();
    const { onChange } = renderProperty({ listType: true, value: [nova] });

    expect(screen.getByText("Nova")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /add entity/i }));
    await user.click(await screen.findByRole("button", { name: "Studio" }));

    expect(onChange).toHaveBeenCalledWith([nova, studio]);
  });

  it("removes a picked entity from the list", async () => {
    const user = userEvent.setup();
    const { onChange } = renderProperty({
      listType: true,
      value: [nova, studio]
    });

    const chip = screen.getByText("Nova").closest(".MuiChip-root");
    const remove = chip?.querySelector(".MuiChip-deleteIcon");
    await user.click(remove as Element);

    expect(onChange).toHaveBeenCalledWith([studio]);
  });

  it("clears a single-value property", async () => {
    const user = userEvent.setup();
    const { onChange } = renderProperty({ value: nova });

    const chip = screen.getByText("Nova").closest(".MuiChip-root");
    const remove = chip?.querySelector(".MuiChip-deleteIcon");
    await user.click(remove as Element);

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("offers only assets that carry an entity marker", async () => {
    const user = userEvent.setup();
    assetSearch.mockResolvedValue({
      assets: [
        assetFor(nova),
        {
          id: "asset-plain",
          name: "screenshot.png",
          content_type: "image/png",
          get_url: "/api/storage/asset-plain.png",
          thumb_url: "/api/storage/asset-plain.png"
        }
      ]
    });
    renderProperty();

    await user.click(screen.getByRole("button", { name: /pick entity/i }));

    expect(await screen.findByRole("button", { name: "Nova" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "screenshot.png" })
    ).not.toBeInTheDocument();
  });
});
