import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import RuntimeInstallDialog from "../RuntimeInstallDialog";
import mockTheme from "../../../__mocks__/themeMock";
import type { MissingRuntime } from "../../../hooks/useWorkflowRuntimeCheck";

const installRuntime = jest.fn();
const openPackageManager = jest.fn();

jest.mock("../../../hooks/useOpenPackageManager", () => ({
  useOpenPackageManager: () => openPackageManager,
}));

jest.mock("../../../utils/errorHandling", () => ({
  createErrorMessage: (err: unknown, fallback: string) => ({
    message: err instanceof Error ? err.message : fallback,
  }),
}));

jest.mock("../../node/NodeDependencyWarning.helpers", () => ({
  RUNTIME_LABELS: { ffmpeg: "FFmpeg & Codecs", python: "Python" },
  ensureRuntimeStatuses: jest.fn().mockResolvedValue(undefined),
  getCachedRuntimeStatuses: jest.fn(() => ({})),
}));

beforeEach(() => {
  installRuntime.mockReset();
  openPackageManager.mockReset();
  (window as unknown as { api: unknown }).api = {
    packages: { installRuntime },
  };
});

afterEach(() => {
  delete (window as unknown as { api?: unknown }).api;
});

const missing: MissingRuntime[] = [
  { id: "ffmpeg", packageId: "ffmpeg" },
  { id: "python", packageId: "python" },
];

function renderDialog(overrides?: Partial<React.ComponentProps<typeof RuntimeInstallDialog>>) {
  return render(
    <ThemeProvider theme={mockTheme}>
      <RuntimeInstallDialog
        missing={missing}
        open
        onClose={jest.fn()}
        {...overrides}
      />
    </ThemeProvider>
  );
}

describe("RuntimeInstallDialog", () => {
  it("lists every missing runtime by its friendly label", () => {
    renderDialog();
    expect(screen.getByText("FFmpeg & Codecs")).toBeInTheDocument();
    expect(screen.getByText("Python")).toBeInTheDocument();
    expect(screen.getByText("Install all")).toBeInTheDocument();
  });

  it("installs each runtime sequentially via the electron IPC and closes on success", async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    installRuntime.mockResolvedValue({ success: true, message: "" });

    renderDialog({ onClose });
    await user.click(screen.getByText("Install all"));

    expect(installRuntime).toHaveBeenCalledWith("ffmpeg");
    expect(installRuntime).toHaveBeenCalledWith("python");
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("keeps the dialog open and offers Retry when an install fails", async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    installRuntime
      .mockResolvedValueOnce({ success: false, message: "disk full" })
      .mockResolvedValueOnce({ success: true, message: "" });

    renderDialog({ onClose });
    await user.click(screen.getByText("Install all"));

    // Failure should surface a Retry button and leave the dialog open.
    await waitFor(() => {
      expect(screen.getByText("Retry")).toBeInTheDocument();
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("hands off to the Package Manager route via the secondary link", async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    renderDialog({ onClose });

    await user.click(screen.getByText("Open Package Manager instead"));

    expect(onClose).toHaveBeenCalled();
    expect(openPackageManager).toHaveBeenCalled();
  });

  it("renders nothing visible when closed", () => {
    renderDialog({ open: false });
    expect(screen.queryByText("Install required runtimes")).not.toBeInTheDocument();
  });
});
