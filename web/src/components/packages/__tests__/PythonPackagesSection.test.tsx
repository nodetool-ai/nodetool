import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import PythonPackagesSection from "../PythonPackagesSection";
import useNodePacksStore from "../../../stores/NodePacksStore";

type WindowWithApi = { api?: unknown };

const renderWithTheme = (component: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);

const reset = () =>
  useNodePacksStore.setState({
    available: true,
    availablePacks: [],
    installed: [],
    busyIds: [],
    consoleLines: [],
    isLoading: false,
    error: null
  });

describe("PythonPackagesSection", () => {
  afterEach(() => {
    (window as unknown as WindowWithApi).api = undefined;
  });

  it("shows a desktop-only notice when the registry IPC is absent", () => {
    (window as unknown as WindowWithApi).api = undefined;
    useNodePacksStore.setState({ available: false });
    renderWithTheme(<PythonPackagesSection />);
    expect(
      screen.getByText(/installing node packs runs in the nodetool desktop app/i)
    ).toBeInTheDocument();
  });

  it("lists registry packs and installs an uninstalled one", async () => {
    const install = jest.fn().mockResolvedValue({ success: true, message: "ok" });
    (window as unknown as WindowWithApi).api = {
      packages: {
        listAvailable: jest.fn().mockResolvedValue({
          packages: [
            {
              name: "HuggingFace",
              description: "HF nodes",
              repo_id: "nodetool-ai/nodetool-huggingface"
            }
          ]
        }),
        listInstalled: jest.fn().mockResolvedValue({ packages: [] }),
        install
      },
      server: { onLog: jest.fn(() => jest.fn()), restart: jest.fn() }
    };
    reset();

    renderWithTheme(<PythonPackagesSection />);

    const installButton = await screen.findByRole("button", { name: /install/i });
    await userEvent.click(installButton);

    await waitFor(() =>
      expect(install).toHaveBeenCalledWith("nodetool-ai/nodetool-huggingface")
    );
  });
});
