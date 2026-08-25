/**
 * DownloadProgress (minimal inline variant) tests
 *
 * The model select dialog renders this row while a recommended model
 * downloads. The row must offer a cancel affordance while the download is
 * active; cancelling dismisses the row through the store's cancel-and-remove
 * action so it returns to its pre-download state.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import { DownloadProgress } from "../DownloadProgress";
import mockTheme from "../../../__mocks__/themeMock";

const cancelAndRemoveDownload = jest.fn().mockResolvedValue(true);

jest.mock("../../../stores/ModelDownloadStore", () => ({
  useModelDownloadStore: jest.fn((selector: (state: unknown) => unknown) =>
    selector({
      downloads: {
        "org/model": {
          id: "org/model",
          status: "running",
          downloadedBytes: 500,
          totalBytes: 1000,
          totalFiles: 2,
          downloadedFiles: 1,
          currentFiles: ["model.safetensors"],
          speed: null,
          speedHistory: []
        }
      },
      cancelAndRemoveDownload,
      removeDownload: jest.fn(),
      wsConnectionState: "connected",
      reconnectWebSocket: jest.fn()
    })
  )
}));

import { useModelDownloadStore } from "../../../stores/ModelDownloadStore";

const renderRow = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <DownloadProgress name="org/model" minimal />
    </ThemeProvider>
  );

beforeEach(() => {
  (useModelDownloadStore as unknown as jest.Mock).mockClear();
  cancelAndRemoveDownload.mockClear();
});

it("shows a cancel button while the download is active", () => {
  renderRow();
  expect(
    screen.getByRole("button", { name: "Cancel download" })
  ).toBeInTheDocument();
});

it("cancels and dismisses the row on click", async () => {
  const user = userEvent.setup();
  renderRow();

  await user.click(screen.getByRole("button", { name: "Cancel download" }));

  expect(cancelAndRemoveDownload).toHaveBeenCalledWith("org/model");
});

it("hides the cancel button once the download completes", () => {
  const hook = useModelDownloadStore as unknown as jest.Mock;
  const original = hook.getMockImplementation();
  hook.mockImplementation((selector: (state: unknown) => unknown) =>
    selector({
      downloads: {
        "org/model": {
          id: "org/model",
          status: "completed",
          downloadedBytes: 1000,
          totalBytes: 1000,
          totalFiles: 2,
          downloadedFiles: 2,
          currentFiles: [],
          speed: null,
          speedHistory: []
        }
      },
      cancelAndRemoveDownload,
      removeDownload: jest.fn(),
      wsConnectionState: "connected",
      reconnectWebSocket: jest.fn()
    })
  );

  try {
    renderRow();
    expect(
      screen.queryByRole("button", { name: "Cancel download" })
    ).not.toBeInTheDocument();
  } finally {
    hook.mockImplementation(original);
  }
});
