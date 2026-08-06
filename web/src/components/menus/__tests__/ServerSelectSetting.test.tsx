import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import ServerSelectSetting from "../ServerSelectSetting";
import useRemoteSettingsStore from "../../../stores/RemoteSettingStore";

jest.mock("../../../stores/RemoteSettingStore");

const fetchSettings = jest.fn().mockResolvedValue([]);
const updateSettings = jest.fn().mockResolvedValue(undefined);

const mockStore = useRemoteSettingsStore as unknown as jest.Mock;

const OPTIONS = [
  { value: "tools", label: "Tools (JSON tool calls)" },
  { value: "codeact", label: "CodeAct (JavaScript actions)" }
] as const;

const setStoredValue = (value: string | undefined) => {
  const state = {
    settings:
      value === undefined
        ? []
        : [{ env_var: "NODETOOL_AGENT_EXECUTION_MODE", value }],
    fetchSettings,
    updateSettings
  };
  mockStore.mockImplementation((selector: (s: typeof state) => unknown) =>
    selector(state)
  );
};

const renderSetting = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ThemeProvider theme={mockTheme}>
        <ServerSelectSetting
          envVar="NODETOOL_AGENT_EXECUTION_MODE"
          label="Agent Execution Mode"
          defaultValue="tools"
          options={OPTIONS}
          description="How agent steps act on their toolbelt."
        />
      </ThemeProvider>
    </QueryClientProvider>
  );

describe("ServerSelectSetting", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("falls back to the default when the setting is unset", () => {
    setStoredValue(undefined);
    renderSetting();
    expect(screen.getByRole("combobox")).toHaveTextContent(
      "Tools (JSON tool calls)"
    );
  });

  it("shows the stored value", () => {
    setStoredValue("codeact");
    renderSetting();
    expect(screen.getByRole("combobox")).toHaveTextContent(
      "CodeAct (JavaScript actions)"
    );
  });

  it("writes the picked value back to the server setting", async () => {
    setStoredValue("tools");
    renderSetting();

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(
      screen.getByRole("option", { name: "CodeAct (JavaScript actions)" })
    );

    expect(updateSettings).toHaveBeenCalledWith({
      NODETOOL_AGENT_EXECUTION_MODE: "codeact"
    });
  });

  it("does not write when the value is unchanged", async () => {
    setStoredValue("codeact");
    renderSetting();

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(
      screen.getByRole("option", { name: "CodeAct (JavaScript actions)" })
    );

    expect(updateSettings).not.toHaveBeenCalled();
  });
});
