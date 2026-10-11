import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import NodeDependencyWarning from "../NodeDependencyWarning";
import useRuntimeStatusStore from "../../../stores/RuntimeStatusStore";
import { installGlobal } from "../../../test-utils/doubles";

jest.mock("../../../hooks/useOpenPackageManager", () => ({
  useOpenPackageManager: () => jest.fn()
}));
jest.mock("../../../utils/browser", () => ({
  ...jest.requireActual("../../../utils/browser"),
  getIsElectronDetails: () => ({ isElectron: true })
}));

it("clears the warning on every node after installing from one", async () => {
  let ffmpegInstalled = false;
  const origApi = window.api;
  installGlobal("api", {
    packages: {
      getRuntimeStatuses: jest.fn(async () => [
        { id: "ffmpeg", installed: ffmpegInstalled }
      ]),
      installRuntime: jest.fn(async () => {
        ffmpegInstalled = true;
      })
    }
  });
  useRuntimeStatusStore.setState({ statuses: null, loaded: false });

  render(
    <ThemeProvider theme={mockTheme}>
      <NodeDependencyWarning requiredRuntimes={["ffmpeg"]} />
      <NodeDependencyWarning requiredRuntimes={["ffmpeg"]} />
    </ThemeProvider>
  );

  const buttons = await screen.findAllByRole("button", { name: /Install/ });
  expect(buttons).toHaveLength(2);

  fireEvent.click(buttons[0]);

  await waitFor(() => {
    expect(screen.queryAllByText(/Requires/)).toHaveLength(0);
  });
  installGlobal("api", origApi);
});
