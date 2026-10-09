import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import useRemoteSettingsStore from "../../../stores/RemoteSettingStore";
import { useNotificationStore } from "../../../stores/NotificationStore";
import ServerNumberSetting from "../ServerNumberSetting";

const settings = [
  {
    package_name: "nodetool",
    env_var: "MAX_CONCURRENT_JOBS",
    group: "Execution",
    description: "",
    is_secret: false,
    value: "4",
    enum: null
  }
];

const renderSetting = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ThemeProvider theme={mockTheme}>
        <ServerNumberSetting
          envVar="MAX_CONCURRENT_JOBS"
          label="Max Concurrent Runs"
          defaultValue={4}
          min={1}
          max={64}
          description="Maximum number of workflow runs."
        />
      </ThemeProvider>
    </QueryClientProvider>
  );

describe("ServerNumberSetting", () => {
  const addNotification = jest.fn();
  const updateSettings = jest.fn();

  beforeEach(() => {
    addNotification.mockReset();
    updateSettings.mockReset();
    useRemoteSettingsStore.setState({
      settings,
      fetchSettings: jest.fn().mockResolvedValue(settings),
      updateSettings
    });
    useNotificationStore.setState({ addNotification });
  });

  it("states the allowed range and default", () => {
    renderSetting();
    expect(
      screen.getByText(/Range 1–64, default 4\./)
    ).toBeInTheDocument();
  });

  it("commits on Enter", async () => {
    updateSettings.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderSetting();
    const input = screen.getByLabelText("Max Concurrent Runs");
    await user.clear(input);
    await user.type(input, "8{Enter}");
    expect(updateSettings).toHaveBeenCalledWith({ MAX_CONCURRENT_JOBS: "8" });
  });

  it("restores the saved value and reports a failed save", async () => {
    updateSettings.mockRejectedValue(new Error("server offline"));
    const user = userEvent.setup();
    renderSetting();
    const input = screen.getByLabelText("Max Concurrent Runs");
    await user.clear(input);
    await user.type(input, "8{Enter}");

    await waitFor(() => expect(input).toHaveValue(4));
    expect(addNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        content: "Could not save Max Concurrent Runs: server offline"
      })
    );
  });
});
