/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { MemoryRouter } from "react-router-dom";
import mockTheme from "../../../__mocks__/themeMock";

const mockImportTimelineZip = jest.fn();
jest.mock("../../../utils/timelineBundle", () => ({
  importTimelineZip: (...args: unknown[]) => mockImportTimelineZip(...args)
}));

const mockCreateMutateAsync = jest.fn();
jest.mock("../../../hooks/useTimelineSequence", () => ({
  useCreateTimeline: () => ({
    mutateAsync: mockCreateMutateAsync,
    isPending: false
  }),
  useTimelines: () => ({ data: [], isLoading: false, isError: false })
}));

const mockInvalidate = jest.fn();
const mockSetData = jest.fn();
jest.mock("../../../trpc/client", () => ({
  trpc: {
    useUtils: () => ({
      timeline: {
        list: { invalidate: mockInvalidate },
        get: { setData: mockSetData }
      }
    })
  }
}));

const mockAddNotification = jest.fn();
jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: {
    getState: () => ({ addNotification: mockAddNotification })
  }
}));

import { CreateTimelineButton } from "../TimelineListPanel";

const timeline = {
  id: "tl-imported",
  name: "Imported video",
  projectId: "default"
};

const renderButton = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <MemoryRouter>
        <CreateTimelineButton />
      </MemoryRouter>
    </ThemeProvider>
  );

const selectFile = async () => {
  const input = screen.getByLabelText(
    "Import timeline archive"
  ) as HTMLInputElement;
  const file = new File([new Uint8Array([1])], "video.zip", {
    type: "application/zip"
  });
  await userEvent.upload(input, file);
  return file;
};

describe("CreateTimelineButton import", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("uploads the chosen archive and primes the timeline caches", async () => {
    mockImportTimelineZip.mockResolvedValue({
      timeline,
      imported: 2,
      missing: [],
      checksum_mismatches: []
    });

    renderButton();
    const file = await selectFile();

    await waitFor(() => expect(mockImportTimelineZip).toHaveBeenCalledTimes(1));
    expect(mockImportTimelineZip.mock.calls[0][0]).toBe(file);
    await waitFor(() => expect(mockInvalidate).toHaveBeenCalledTimes(1));
    expect(mockSetData).toHaveBeenCalledWith({ id: "tl-imported" }, timeline);
    expect(mockAddNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "success",
        content: "Imported Imported video"
      })
    );
  });

  it("warns when the archive was missing assets", async () => {
    mockImportTimelineZip.mockResolvedValue({
      timeline,
      imported: 1,
      missing: ["a", "b"],
      checksum_mismatches: []
    });

    renderButton();
    await selectFile();

    await waitFor(() =>
      expect(mockAddNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "warning",
          content: "2 asset(s) were not in the archive"
        })
      )
    );
  });

  it("reports a failed import instead of throwing", async () => {
    mockImportTimelineZip.mockRejectedValue(new Error("boom"));

    renderButton();
    await selectFile();

    await waitFor(() =>
      expect(mockAddNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "error",
          content: "Could not import the timeline. Please try again."
        })
      )
    );
    expect(mockInvalidate).not.toHaveBeenCalled();
  });
});
