import React, { useState } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@mui/material/styles";
import type { SamplerMidiInstrument } from "@nodetool-ai/timeline";
import mockTheme from "../../../../__mocks__/themeMock";
import SamplerInstrumentEditor from "../SamplerInstrumentEditor";

jest.mock("../../../../trpc/client", () => ({
  trpcClient: {
    assets: {
      search: {
        query: jest.fn().mockResolvedValue({
          assets: [
            { id: "a".repeat(32), name: "Taiko", content_type: "audio/wav" }
          ]
        })
      }
    }
  }
}));
jest.mock("../../../../serverState/useAssetUpload", () => ({
  useAssetUpload: () => jest.fn()
}));
jest.mock("../../../../stores/WorkspaceTabsStore", () => ({
  LOOSE_PROJECT_ID: "personal:1",
  useWorkspaceTabsStore: () => "personal:1"
}));

it("adds a recording as a drum, remaps its key, selects gated playback and removes it", async () => {
  const changed = jest.fn();
  const auditioned = jest.fn();
  function Editor() {
    const [instrument, setInstrument] = useState<SamplerMidiInstrument>({
      type: "sampler",
      zones: [],
      oneShot: true,
      attackMs: 0,
      releaseMs: 100,
      gainDb: -6
    });
    return (
      <SamplerInstrumentEditor
        instrument={instrument}
        onChange={(next, pitch) => {
          setInstrument(next);
          changed(next);
          auditioned(pitch);
        }}
      />
    );
  }
  const user = userEvent.setup();
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ThemeProvider theme={mockTheme}>
        <Editor />
      </ThemeProvider>
    </QueryClientProvider>
  );
  await waitFor(() =>
    expect(screen.queryByText("Loading samples…")).not.toBeInTheDocument()
  );
  await user.click(screen.getByRole("combobox", { name: "Audio sample" }));
  await user.click(screen.getByRole("option", { name: "Taiko" }));
  await user.click(screen.getByRole("button", { name: "Add sample" }));
  expect(changed).toHaveBeenLastCalledWith(
    expect.objectContaining({
      zones: [
        expect.objectContaining({
          assetId: "a".repeat(32),
          rootNote: 36,
          lowNote: 36,
          highNote: 36
        })
      ]
    })
  );
  fireEvent.change(
    screen.getByRole("spinbutton", { name: "Taiko root note" }),
    { target: { value: "40" } }
  );
  expect(auditioned).toHaveBeenLastCalledWith(40);
  expect(changed).toHaveBeenLastCalledWith(
    expect.objectContaining({
      zones: [
        expect.objectContaining({ rootNote: 40, lowNote: 40, highNote: 40 })
      ]
    })
  );
  await user.click(screen.getByRole("combobox", { name: "Playback" }));
  await user.click(
    screen.getByRole("option", { name: "Gated · release at note-off" })
  );
  expect(changed).toHaveBeenLastCalledWith(
    expect.objectContaining({ oneShot: false })
  );
  await user.click(screen.getByRole("button", { name: "Remove Taiko" }));
  expect(
    screen.getByText("Add a recording to play this instrument.")
  ).toBeInTheDocument();
  const addSample = async () => {
    await user.click(screen.getByRole("combobox", { name: "Audio sample" }));
    await user.click(screen.getByRole("option", { name: "Taiko" }));
    await user.click(screen.getByRole("button", { name: "Add sample" }));
  };
  await addSample();
  await addSample();
  await user.click(screen.getAllByRole("button", { name: "Remove Taiko" })[0]);
  await addSample();
  expect(changed).toHaveBeenLastCalledWith(
    expect.objectContaining({
      zones: [
        expect.objectContaining({ rootNote: 37 }),
        expect.objectContaining({ rootNote: 36 })
      ]
    })
  );
});
