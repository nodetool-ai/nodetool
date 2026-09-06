/**
 * @jest-environment jsdom
 *
 * PRD § 10.7, criterion 5 — `Pick` opens the editor with the picked variation
 * visible and the others hidden, each keeping the `layerVersion` its
 * generation recorded. Nothing rendered is thrown away, which is the whole
 * reason the losers stay on the document instead of being deleted.
 */
import React from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { LayerVersion } from "@nodetool-ai/image-editor";

jest.mock("../../../../hooks/useResolvedMediaUri");

const start = jest.fn(async (_layerId: string) => {});
jest.mock("../../../../hooks/sketch/useDirectGenJob", () => ({
  useDirectGenJob: () => ({ start, cancel: jest.fn() })
}));

import mockTheme from "../../../../__mocks__/themeMock";
import { ContactSheet } from "../ContactSheet";
import { useSketchStore } from "../../../sketch/state/useSketchStore";
import { useSketchSessionStore } from "../../../../stores/sketch/SketchSessionStore";
import { createDefaultDocument } from "../../../sketch/types";

const version = (assetId: string): LayerVersion => ({
  id: `v-${assetId}`,
  createdAt: "2026-09-05T00:00:00.000Z",
  jobId: `req-${assetId}`,
  assetId,
  workflowUpdatedAt: "",
  dependencyHash: "hash",
  paramOverridesSnapshot: {},
  status: "success"
});

/** Four landed variations, as `generateVariations` plus the job hook leave them. */
const seedBatch = (): string[] => {
  act(() => {
    useSketchStore.getState().setDocument(createDefaultDocument(1024, 1024));
  });
  const layerIds: string[] = [];
  act(() => {
    for (let index = 0; index < 4; index += 1) {
      layerIds.push(
        useSketchStore.getState().addLayer(`Variation ${index + 1}`)
      );
    }
    const bindings = Object.fromEntries(
      layerIds.map((layerId, index) => [
        layerId,
        {
          layerId,
          kind: "text-to-image",
          prompt: "a dripper",
          provider: "prov",
          model: "model-1",
          width: 1024,
          height: 1024,
          seed: 100 + index,
          status: "generated",
          currentAssetId: `asset-${index + 1}`,
          versions: [version(`asset-${index + 1}`)]
        }
      ])
    );
    useSketchSessionStore.setState({ bindings } as never);
  });
  return layerIds;
};

const onPick = jest.fn();
const onMakeMore = jest.fn();
const onUseInStoryboard = jest.fn();

beforeEach(() => {
  onPick.mockClear();
  onMakeMore.mockClear();
  onUseInStoryboard.mockClear();
  start.mockClear();
});

describe("ContactSheet Pick (criterion 5)", () => {
  it("shows the picked layer, hides the others, and keeps every version", async () => {
    const layerIds = seedBatch();
    render(
      <ThemeProvider theme={mockTheme}>
        <ContactSheet
          layerIds={layerIds}
          onPick={onPick}
          onMakeMore={onMakeMore}
          onUseInStoryboard={onUseInStoryboard}
        />
      </ThemeProvider>
    );

    const picks = screen.getAllByRole("button", { name: "Pick" });
    expect(picks).toHaveLength(4);
    await userEvent.click(picks[2]);

    const document = useSketchStore.getState().document;
    const visible = document.layers
      .filter((layer) => layerIds.includes(layer.id))
      .filter((layer) => layer.visible)
      .map((layer) => layer.id);
    expect(visible).toEqual([layerIds[2]]);
    expect(document.activeLayerId).toBe(layerIds[2]);

    // The three that lost are still on the document, each with its record.
    const bindings = useSketchSessionStore.getState().bindings;
    for (const layerId of layerIds) {
      expect(document.layers.some((layer) => layer.id === layerId)).toBe(true);
      expect(bindings[layerId].versions).toHaveLength(1);
      expect(bindings[layerId].versions[0].assetId).toBe(
        bindings[layerId].currentAssetId
      );
    }

    // The host is told which one to open the editor on.
    expect(onPick).toHaveBeenCalledWith(layerIds[2]);
  });

  it("regenerates one variation in place", async () => {
    const layerIds = seedBatch();
    render(
      <ThemeProvider theme={mockTheme}>
        <ContactSheet
          layerIds={layerIds}
          onPick={onPick}
          onMakeMore={onMakeMore}
          onUseInStoryboard={onUseInStoryboard}
        />
      </ThemeProvider>
    );
    await userEvent.click(
      screen.getAllByRole("button", { name: "Regenerate" })[1]
    );
    expect(start).toHaveBeenCalledWith(layerIds[1]);
    // Nothing was hidden: regenerating is not a choice.
    const document = useSketchStore.getState().document;
    expect(
      document.layers.filter((layer) => layerIds.includes(layer.id)).every(
        (layer) => layer.visible
      )
    ).toBe(true);
  });

  it("offers the strip's two follow-ups", async () => {
    const layerIds = seedBatch();
    render(
      <ThemeProvider theme={mockTheme}>
        <ContactSheet
          layerIds={layerIds}
          onPick={onPick}
          onMakeMore={onMakeMore}
          onUseInStoryboard={onUseInStoryboard}
        />
      </ThemeProvider>
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Make more variations" })
    );
    expect(onMakeMore).toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: "Use in a storyboard" })
    );
    expect(onUseInStoryboard).toHaveBeenCalledWith(layerIds[3]);
  });
});
