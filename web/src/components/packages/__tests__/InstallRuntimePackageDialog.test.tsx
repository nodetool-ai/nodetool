import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import mockTheme from "../../../__mocks__/themeMock";
import InstallRuntimePackageDialog from "../InstallRuntimePackageDialog";
import useRuntimePackagePromptStore from "../../../stores/RuntimePackagePromptStore";
import useRuntimePackagesStore from "../../../stores/RuntimePackagesStore";

const renderDialog = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ThemeProvider theme={mockTheme}>
        <InstallRuntimePackageDialog />
      </ThemeProvider>
    </QueryClientProvider>
  );

const whisper = {
  id: "whisper-cpp",
  name: "whisper.cpp",
  description: "Transcribes audio inside the NodeTool backend.",
  installed: false,
  installing: false
};

describe("InstallRuntimePackageDialog", () => {
  beforeEach(() => {
    useRuntimePackagePromptStore.setState({ packageId: "whisper-cpp" });
  });

  it("installs the missing package in place", async () => {
    const install = jest.fn(async () => true);
    useRuntimePackagesStore.setState({
      available: true,
      statuses: [whisper],
      refresh: jest.fn(async () => {}),
      install
    });
    renderDialog();

    expect(screen.getByText("Install whisper.cpp?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Install" }));

    expect(install).toHaveBeenCalledWith("whisper-cpp");
    expect(await screen.findByText("whisper.cpp is installed")).toBeInTheDocument();
  });

  it("sends a browser session to the Package Manager", () => {
    useRuntimePackagesStore.setState({
      available: false,
      statuses: [whisper],
      refresh: jest.fn(async () => {})
    });
    renderDialog();

    expect(screen.getByText("whisper.cpp is not installed")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open Package Manager" })
    ).toBeInTheDocument();
  });
});
