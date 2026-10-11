/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { MemoryRouter } from "react-router-dom";
import mockTheme from "../../../__mocks__/themeMock";
import type { SidebarDocumentMenuHandlers } from "../../../hooks/useSidebarDocumentMenu";

const mockCreateMutateAsync = jest.fn();
jest.mock("../../../hooks/useTimelineSequence", () => ({
  useCreateTimeline: () => ({
    mutateAsync: mockCreateMutateAsync,
    isPending: false
  }),
  useTimelines: () => ({ data: [], isLoading: false, isError: false })
}));

const mockFetch = jest.fn();
const mockUpdateMutateAsync = jest.fn();
jest.mock("../../../trpc/client", () => ({
  trpc: {
    useUtils: () => ({
      timeline: {
        list: { invalidate: jest.fn() },
        get: { setData: jest.fn(), fetch: mockFetch }
      }
    }),
    timeline: {
      update: {
        useMutation: () => ({
          mutate: jest.fn(),
          mutateAsync: mockUpdateMutateAsync
        })
      },
      delete: { useMutation: () => ({ mutate: jest.fn() }) }
    }
  }
}));

let capturedHandlers: SidebarDocumentMenuHandlers | null = null;
jest.mock("../../../hooks/useSidebarDocumentMenu", () => ({
  useSidebarDocumentMenu: (handlers: SidebarDocumentMenuHandlers) => {
    capturedHandlers = handlers;
    return jest.fn();
  }
}));

import TimelineListPanel from "../TimelineListPanel";

describe("TimelineListPanel duplicate", () => {
  it("copies every document field of the source", async () => {
    const source = {
      id: "src",
      name: "Source",
      projectId: "p1",
      fps: 30,
      width: 1920,
      height: 1080,
      tracks: [{ id: "t1" }],
      trackFolders: [],
      clips: [{ id: "c1" }],
      markers: [],
      mediaTracks: [{ id: "m1" }],
      transcript: null,
      scriptEnabled: true,
      tempo: { bpm: 120 },
      storyboardMaterializations: { s1: { clipIds: ["c1"] } },
      camera2d: { zoom: 2 },
      setup: { stage: "edit" }
    };
    mockFetch.mockResolvedValue(source);
    mockCreateMutateAsync.mockResolvedValue({ id: "copy" });
    mockUpdateMutateAsync.mockResolvedValue({});

    render(
      <ThemeProvider theme={mockTheme}>
        <MemoryRouter>
          <TimelineListPanel projectId="p1" />
        </MemoryRouter>
      </ThemeProvider>
    );
    await capturedHandlers?.onDuplicate({ id: "src", name: "Source" });

    await waitFor(() => expect(mockUpdateMutateAsync).toHaveBeenCalled());
    const { document } = mockUpdateMutateAsync.mock.calls[0][0];
    expect(document).toEqual(
      expect.objectContaining({
        tracks: source.tracks,
        clips: source.clips,
        mediaTracks: source.mediaTracks,
        tempo: source.tempo,
        storyboardMaterializations: source.storyboardMaterializations,
        camera2d: source.camera2d,
        setup: source.setup,
        scriptEnabled: true
      })
    );
  });
});
