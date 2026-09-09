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
/** The reasons the hook would have recorded for this batch's layers. */
const mockFailures = new Map<
  string,
  { kind: string; message: string; detail: string }
>();
jest.mock("../../../../hooks/sketch/useDirectGenJob", () => ({
  useDirectGenJob: () => ({ start, cancel: jest.fn() }),
  directGenFailure: (layerId: string) => mockFailures.get(layerId) ?? null,
  describeDirectGenFailure: (failure: {
    message: string;
    detail: string;
  }): string =>
    failure.detail ? `${failure.message} (${failure.detail})` : failure.message
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

const onOpenCanvas = jest.fn(async (_layerId: string, _animate: boolean) => {});
const onPick = jest.fn();
const onMakeMore = jest.fn();
const onSaveToLibrary = jest.fn(async (_layerId: string) => {});
const onBackToSettings = jest.fn();
const onOpenEditor = jest.fn();

beforeEach(() => {
  onOpenCanvas.mockClear();
  onPick.mockClear();
  onMakeMore.mockClear();
  onSaveToLibrary.mockClear();
  onBackToSettings.mockClear();
  onOpenEditor.mockClear();
  start.mockClear();
  mockFailures.clear();
});

describe("ContactSheet Pick (criterion 5)", () => {
  it.each(["draft", "queued", "generating"] as const)(
    "marks %s previews busy, including regeneration, until the batch settles",
    (status) => {
      const layerIds = seedBatch();
      const generatedBindings = useSketchSessionStore.getState().bindings;
      act(() =>
        useSketchSessionStore.setState({
          bindings: Object.fromEntries(
            Object.entries(generatedBindings).map(([id, binding], index) => [
              id,
              {
                ...binding,
                status,
                currentAssetId: index === 0 ? undefined : binding.currentAssetId
              }
            ])
          )
        })
      );
      render(
        <ThemeProvider theme={mockTheme}>
          <ContactSheet
            layerIds={layerIds}
            onPick={onPick}
            onMakeMore={onMakeMore}
            onBackToSettings={onBackToSettings}
            onOpenEditor={onOpenEditor}
            onSaveToLibrary={onSaveToLibrary}
            onOpenCanvas={onOpenCanvas}
          />
        </ThemeProvider>
      );
      const previews = screen.getAllByRole("group", {
        name: /Variation \d preview/
      });
      expect(previews).toHaveLength(4);
      for (const preview of previews) {
        expect(preview).toHaveAttribute("aria-busy", "true");
      }
      expect(
        screen.getByRole("img", { name: "Variation 2" })
      ).toBeInTheDocument();
      act(() =>
        useSketchSessionStore.setState({ bindings: generatedBindings })
      );
      for (const preview of previews) {
        expect(preview).toHaveAttribute("aria-busy", "false");
      }
    }
  );

  it("shows the picked layer, hides the others, and keeps every version", async () => {
    const layerIds = seedBatch();
    render(
      <ThemeProvider theme={mockTheme}>
        <ContactSheet
          layerIds={layerIds}
          onPick={onPick}
          onMakeMore={onMakeMore}
          onBackToSettings={onBackToSettings}
          onOpenEditor={onOpenEditor}
          onSaveToLibrary={onSaveToLibrary}
          onOpenCanvas={onOpenCanvas}
        />
      </ThemeProvider>
    );

    const picks = screen.getAllByRole("button", { name: "Sketch editor" });
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
          onBackToSettings={onBackToSettings}
          onOpenEditor={onOpenEditor}
          onSaveToLibrary={onSaveToLibrary}
          onOpenCanvas={onOpenCanvas}
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
      document.layers
        .filter((layer) => layerIds.includes(layer.id))
        .every((layer) => layer.visible)
    ).toBe(true);
  });

  it("offers the strip's follow-ups", async () => {
    const layerIds = seedBatch();
    render(
      <ThemeProvider theme={mockTheme}>
        <ContactSheet
          layerIds={layerIds}
          onPick={onPick}
          onMakeMore={onMakeMore}
          onBackToSettings={onBackToSettings}
          onOpenEditor={onOpenEditor}
          onSaveToLibrary={onSaveToLibrary}
          onOpenCanvas={onOpenCanvas}
        />
      </ThemeProvider>
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Make more variations" })
    );
    expect(onMakeMore).toHaveBeenCalled();
    await userEvent.click(
      screen.getAllByRole("button", { name: "Save to entities" })[3]
    );
    expect(onSaveToLibrary).toHaveBeenCalledWith(layerIds[3]);
    await userEvent.click(
      screen.getAllByRole("button", { name: "New node canvas" })[1]
    );
    expect(onOpenCanvas).toHaveBeenLastCalledWith(layerIds[1], false);
    await userEvent.click(
      screen.getAllByRole("button", { name: "Image to video" })[2]
    );
    expect(onOpenCanvas).toHaveBeenLastCalledWith(layerIds[2], true);
    expect(onPick).not.toHaveBeenCalled();
    onOpenCanvas.mockRejectedValueOnce(new Error("Network error"));
    await userEvent.click(
      screen.getAllByRole("button", { name: "New node canvas" })[0]
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not open that destination"
    );
    expect(
      screen.getAllByRole("button", { name: "New node canvas" })[0]
    ).toBeEnabled();
  });
});

/**
 * F7 — a batch that renders nothing is the one state `Pick` cannot leave, so
 * the sheet keeps two exits and a retry per variation, and says out loud how
 * many landed.
 */
describe("a failed batch", () => {
  /** Four requests, all refused, as `useDirectGenJob` leaves them. */
  const seedFailedBatch = (): string[] => {
    const layerIds = seedBatch();
    act(() => {
      const bindings = useSketchSessionStore.getState().bindings;
      useSketchSessionStore.setState({
        bindings: Object.fromEntries(
          Object.entries(bindings).map(([layerId, binding]) => [
            layerId,
            { ...binding, status: "failed", currentAssetId: undefined }
          ])
        )
      } as never);
    });
    return layerIds;
  };

  const renderSheet = (layerIds: string[]) =>
    render(
      <ThemeProvider theme={mockTheme}>
        <ContactSheet
          layerIds={layerIds}
          onPick={onPick}
          onMakeMore={onMakeMore}
          onBackToSettings={onBackToSettings}
          onOpenEditor={onOpenEditor}
          onSaveToLibrary={onSaveToLibrary}
          onOpenCanvas={onOpenCanvas}
        />
      </ThemeProvider>
    );

  it("leaves two ways out when nothing rendered", async () => {
    const layerIds = seedFailedBatch();
    renderSheet(layerIds);

    // Every Pick is dead, which is exactly why the exits have to exist.
    for (const pick of screen.getAllByRole("button", {
      name: "Sketch editor"
    })) {
      expect(pick).toBeDisabled();
    }

    await userEvent.click(
      screen.getByRole("button", { name: "Back to generation settings" })
    );
    expect(onBackToSettings).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Open editor" }));
    expect(onOpenEditor).toHaveBeenCalled();
  });

  it("announces the counts and retries one variation", async () => {
    const layerIds = seedFailedBatch();
    renderSheet(layerIds);

    expect(screen.getByRole("status")).toHaveTextContent(
      "0 of 4 rendered · 4 failed"
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Try Variation 2 again" })
    );
    expect(start).toHaveBeenCalledWith(layerIds[1]);
  });
});

/**
 * F7 — the reason the take gave is what the creator acts on. A quota and a
 * refused prompt need different remedies, so the sheet renders the difference
 * rather than "failed" four times.
 */
describe("failure reasons", () => {
  const renderSheet = (layerIds: string[]) =>
    render(
      <ThemeProvider theme={mockTheme}>
        <ContactSheet
          layerIds={layerIds}
          onPick={onPick}
          onMakeMore={onMakeMore}
          onBackToSettings={onBackToSettings}
          onOpenEditor={onOpenEditor}
          onSaveToLibrary={onSaveToLibrary}
          onOpenCanvas={onOpenCanvas}
        />
      </ThemeProvider>
    );

  /** One landed, two failed for different reasons. */
  const seedMixedBatch = (): string[] => {
    const layerIds = seedBatch();
    act(() => {
      const bindings = useSketchSessionStore.getState().bindings;
      useSketchSessionStore.setState({
        bindings: {
          ...bindings,
          [layerIds[1]]: {
            ...bindings[layerIds[1]],
            status: "failed",
            currentAssetId: undefined
          },
          [layerIds[2]]: {
            ...bindings[layerIds[2]],
            status: "failed",
            currentAssetId: undefined
          }
        }
      } as never);
    });
    mockFailures.set(layerIds[1], {
      kind: "quota",
      message:
        "The provider turned the request away for now. Wait a moment, or use another model.",
      detail: "You exceeded your quota"
    });
    mockFailures.set(layerIds[2], {
      kind: "refused",
      message: "The provider refused this prompt. Reword it and try again.",
      detail: "content policy"
    });
    return layerIds;
  };

  it("shows each reason beside its own retry", () => {
    renderSheet(seedMixedBatch());
    expect(screen.getByText(/You exceeded your quota/)).toBeInTheDocument();
    expect(screen.getByText(/Reword it and try again/)).toBeInTheDocument();
  });

  it("says a shared reason once", () => {
    const layerIds = seedBatch();
    act(() => {
      const bindings = useSketchSessionStore.getState().bindings;
      useSketchSessionStore.setState({
        bindings: Object.fromEntries(
          Object.entries(bindings).map(([layerId, binding]) => [
            layerId,
            { ...binding, status: "failed", currentAssetId: undefined }
          ])
        )
      } as never);
    });
    for (const layerId of layerIds) {
      mockFailures.set(layerId, {
        kind: "auth",
        message:
          "The provider rejected the request as unauthorized. Check its API key in Settings.",
        detail: "invalid api key"
      });
    }
    renderSheet(layerIds);
    expect(screen.getAllByText(/invalid api key/)).toHaveLength(1);
  });
});
