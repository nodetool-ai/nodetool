import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";

import PackageManager from "../PackageManager";
import usePacksStore from "../../../stores/PacksStore";
import useRuntimePackagesStore from "../../../stores/RuntimePackagesStore";
import useNodePacksStore from "../../../stores/NodePacksStore";
import useOptionalNodePacksStore from "../../../stores/OptionalNodePacksStore";

jest.mock("../../../trpc/client", () => ({
  trpcClient: { packs: { runtimeStatuses: { query: jest.fn() } } }
}));

const installRuntime = jest.fn(async () => ({ success: true, message: "ok" }));
const install = jest.fn(async () => ({ success: true, message: "ok" }));

beforeAll(() => {
  Object.defineProperty(window, "api", {
    configurable: true,
    value: {
      server: { onLog: () => () => {}, restart: jest.fn() },
      packages: {
        listAvailable: async () => ({
          packages: [
            {
              repo_id: "nodetool-ai/nodetool-huggingface",
              name: "HF",
              description: "HF nodes."
            }
          ],
          count: 1
        }),
        listInstalled: async () => ({ packages: [], count: 0 }),
        install,
        getRuntimeStatuses: async () => [
          {
            id: "yt-dlp",
            name: "yt-dlp",
            description: "Downloader.",
            installed: false,
            installing: false
          }
        ],
        getInstallLocation: async () => null,
        installRuntime
      }
    }
  });
});

beforeEach(() => {
  usePacksStore.setState({ fetchBuiltins: async () => {}, fetch: async () => {} });
  useOptionalNodePacksStore.setState({});
  useNodePacksStore.setState({ available: true });
  useRuntimePackagesStore.setState({ available: true });
});

it("installs a runtime from the Software list", async () => {
  localStorage.setItem("nodetool.packageManager.location", JSON.stringify({ cat: "runtimes" }));
  render(
    <ThemeProvider theme={mockTheme}>
      <PackageManager />
    </ThemeProvider>
  );
  const button = await screen.findByRole("button", { name: "Install" });
  await userEvent.click(button);
  await waitFor(() => expect(installRuntime).toHaveBeenCalled());
});

it("installs a Python pack", async () => {
  localStorage.setItem("nodetool.packageManager.location", JSON.stringify({ cat: "python" }));
  render(
    <ThemeProvider theme={mockTheme}>
      <PackageManager />
    </ThemeProvider>
  );
  const button = await screen.findByRole("button", { name: "Install" });
  await userEvent.click(button);
  await waitFor(() => expect(install).toHaveBeenCalled());
});
