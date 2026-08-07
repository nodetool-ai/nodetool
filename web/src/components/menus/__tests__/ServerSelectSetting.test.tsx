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
  { value: "serpapi", label: "SerpAPI" },
  { value: "brave", label: "Brave Search" }
] as const;

const setStoredValue = (value: string | undefined) => {
  const state = {
    settings:
      value === undefined
        ? []
        : [{ env_var: "SERP_PROVIDER", value }],
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
          envVar="SERP_PROVIDER"
          label="Search Provider"
          defaultValue="serpapi"
          options={OPTIONS}
          description="Which provider backs web search."
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
    expect(screen.getByRole("combobox")).toHaveTextContent("SerpAPI");
  });

  it("shows the stored value", () => {
    setStoredValue("brave");
    renderSetting();
    expect(screen.getByRole("combobox")).toHaveTextContent("Brave Search");
  });

  it("writes the picked value back to the server setting", async () => {
    setStoredValue("serpapi");
    renderSetting();

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(screen.getByRole("option", { name: "Brave Search" }));

    expect(updateSettings).toHaveBeenCalledWith({
      SERP_PROVIDER: "brave"
    });
  });

  it("does not write when the value is unchanged", async () => {
    setStoredValue("brave");
    renderSetting();

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(screen.getByRole("option", { name: "Brave Search" }));

    expect(updateSettings).not.toHaveBeenCalled();
  });
});
