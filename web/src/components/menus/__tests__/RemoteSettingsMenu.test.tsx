import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import RemoteSettingsMenuComponent from "../RemoteSettingsMenu";
import useRemoteSettingsStore from "../../../stores/RemoteSettingStore";
import { useNotificationStore } from "../../../stores/NotificationStore";

jest.mock("../../../stores/RemoteSettingStore");
jest.mock("../../../stores/NotificationStore");
jest.mock("../../common/ExternalLink", () => {
  return function MockExternalLink({ href, children, tooltipText }: any) {
    return (
      <a href={href} title={tooltipText}>
        {children}
      </a>
    );
  };
});
jest.mock("../settingsMenuStyles", () => ({
  __esModule: true,
  getSharedSettingsStyles: () => ({}),
  settingsStyles: () => ({})
}));

// Mock MUI components to avoid theme complexity
jest.mock("@mui/material", () => ({
  ...jest.requireActual("@mui/material"),
  Button: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>{children}</button>
  ),
  TextField: ({ label, value, onChange, children, ...props }: any) => (
    <div data-testid="TextField">
      {label && <span className="textfield-label">{label}</span>}
      <input {...props} value={value || ""} onChange={onChange} />
      {children}
    </div>
  ),
  Typography: ({ children, ...props }: any) => (
    <span {...props}>{children}</span>
  ),
  Select: ({ children, ...props }: any) => (
    <select {...props} data-testid="Select">{children}</select>
  ),
  MenuItem: ({ children, ...props }: any) => (
    <option {...props}>{children}</option>
  ),
  FormControl: ({ children, ...props }: any) => (
    <div {...props}>{children}</div>
  ),
  InputLabel: ({ children, ...props }: any) => (
    <label {...props}>{children}</label>
  )
}));

const mockUseRemoteSettingsStore = useRemoteSettingsStore as jest.MockedFunction<
  typeof useRemoteSettingsStore
>;
const mockUseNotificationStore = useNotificationStore as jest.MockedFunction<
  typeof useNotificationStore
>;

const mockRemoteSettingsStore = {
  fetchSettings: jest.fn(),
  updateSettings: jest.fn(),
  getSettingValue: jest.fn(),
  setSettingValue: jest.fn()
};

const mockNotificationStore = {
  addNotification: jest.fn()
};

const theme = mockTheme;
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false }
  }
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </QueryClientProvider>
);

describe("RemoteSettingsMenu", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();

    // Mock useRemoteSettingsStore to handle both selector and non-selector calls
    mockUseRemoteSettingsStore.mockImplementation((selector?) => {
      if (typeof selector === "function") {
        // Handle selector calls
        const storeState = {
          ...mockRemoteSettingsStore,
          settings: [],
          settingsByGroup: new Map(),
          isLoading: false,
          error: null
        };
        return selector(storeState);
      }
      // Handle non-selector calls (backward compatibility)
      return mockRemoteSettingsStore as any;
    });

    mockUseNotificationStore.mockImplementation((selector?: (state: any) => unknown) => {
      if (typeof selector === "function") {
        return selector(mockNotificationStore);
      }
      return mockNotificationStore as any;
    });

    mockRemoteSettingsStore.fetchSettings.mockResolvedValue([]);
  });

  describe("Filtering Secrets", () => {
    it("should not display secret settings", async () => {
      const mockSettings = [
        {
          package_name: "nodetool",
          env_var: "API_KEY",
          group: "API Services",
          description: "API key for external service",
          is_secret: true,
          value: "********",
          enum: null
        },
        {
          package_name: "nodetool",
          env_var: "TIMEOUT",
          group: "Configuration",
          description: "Request timeout in seconds",
          is_secret: false,
          value: "30",
          enum: null
        }
      ];

      mockRemoteSettingsStore.fetchSettings.mockResolvedValue(mockSettings);

      render(<RemoteSettingsMenuComponent />, { wrapper });

      await waitFor(() => {
        // Non-secret setting should be visible (label is title-cased)
        expect(screen.getByText("Timeout")).toBeInTheDocument();
        expect(screen.getByText("Request timeout in seconds")).toBeInTheDocument();

        // Secret setting should NOT be visible
        expect(screen.queryByText("API_KEY")).not.toBeInTheDocument();
        expect(
          screen.queryByText("API key for external service")
        ).not.toBeInTheDocument();
      });
    });

    it("should not include secret settings in update", async () => {
      const mockSettings = [
        {
          package_name: "nodetool",
          env_var: "API_KEY",
          group: "API Services",
          description: "API key",
          is_secret: true,
          value: "********",
          enum: null
        },
        {
          package_name: "nodetool",
          env_var: "TIMEOUT",
          group: "Configuration",
          description: "Timeout",
          is_secret: false,
          value: "30",
          enum: null
        }
      ];

      mockRemoteSettingsStore.fetchSettings.mockResolvedValue(mockSettings);
      mockRemoteSettingsStore.updateSettings.mockResolvedValue(undefined);
      const user = userEvent.setup();

      render(<RemoteSettingsMenuComponent />, { wrapper });

      await waitFor(() => {
        expect(screen.getByDisplayValue("30")).toBeInTheDocument();
      });

      // Update the non-secret setting
      const timeoutInput = screen.getByDisplayValue("30");
      await user.clear(timeoutInput);
      await user.type(timeoutInput, "60");

      // Save settings
      const saveButton = screen.getByRole("button", { name: /SAVE SETTINGS/i });
      await user.click(saveButton);

      await waitFor(() => {
        // Should only update non-secret settings
        expect(mockRemoteSettingsStore.updateSettings).toHaveBeenCalledWith(
          {
            TIMEOUT: "60"
          },
          expect.anything()
        );

        // Secret settings should NOT be included in the settings object
        expect(mockRemoteSettingsStore.updateSettings).not.toHaveBeenCalledWith(
          expect.objectContaining({
            API_KEY: expect.anything()
          }),
          expect.anything()
        );
      });
    });

    it("should filter secrets from sidebar sections", async () => {
      const mockSettings = [
        {
          package_name: "nodetool",
          env_var: "API_KEY",
          group: "Secrets",
          description: "API key",
          is_secret: true,
          value: "********",
          enum: null
        },
        {
          package_name: "nodetool",
          env_var: "DB_HOST",
          group: "Database",
          description: "Database host",
          is_secret: false,
          value: "localhost",
          enum: null
        }
      ];

      mockRemoteSettingsStore.fetchSettings.mockResolvedValue(mockSettings);

      render(<RemoteSettingsMenuComponent />, { wrapper });

      // Non-secret setting renders; the save bar stays hidden without edits.
      await waitFor(() => {
        expect(screen.getByDisplayValue("localhost")).toBeInTheDocument();
      });
      expect(
        screen.queryByRole("button", { name: /SAVE SETTINGS/i })
      ).not.toBeInTheDocument();
    });

    it("should remove empty groups after filtering secrets", async () => {
      const mockSettings = [
        {
          package_name: "nodetool",
          env_var: "API_KEY",
          group: "Secrets",
          description: "API key",
          is_secret: true,
          value: "********",
          enum: null
        }
      ];

      mockRemoteSettingsStore.fetchSettings.mockResolvedValue(mockSettings);

      render(<RemoteSettingsMenuComponent />, { wrapper });

      await waitFor(() => {
        // Should show "No settings available" since all settings are secrets
        expect(screen.getByText("No settings available")).toBeInTheDocument();
      });
    });
  });

  describe("Non-Secret Settings Display", () => {
    it("should display settings component without errors", async () => {
      const mockSettings = [
        {
          package_name: "nodetool",
          env_var: "TIMEOUT",
          group: "Configuration",
          description: "Request timeout",
          is_secret: false,
          value: "30",
          enum: null
        }
      ];

      mockRemoteSettingsStore.fetchSettings.mockResolvedValue(mockSettings);

      render(<RemoteSettingsMenuComponent />, { wrapper });

      // Component should render without throwing
      await waitFor(() => {
        expect(screen.getByDisplayValue("30")).toBeInTheDocument();
      });
    });
  });

  describe("Update Functionality", () => {
    it("should call updateSettings without throwing errors", async () => {
      const mockSettings = [
        {
          package_name: "nodetool",
          env_var: "TIMEOUT",
          group: "Configuration",
          description: "Timeout",
          is_secret: false,
          value: "30",
          enum: null
        }
      ];

      mockRemoteSettingsStore.fetchSettings.mockResolvedValue(mockSettings);
      mockRemoteSettingsStore.updateSettings.mockResolvedValue(undefined);
      const user = userEvent.setup();

      render(<RemoteSettingsMenuComponent />, { wrapper });

      // The save bar only appears once a field is edited.
      const input = await screen.findByDisplayValue("30");
      expect(
        screen.queryByRole("button", { name: /SAVE SETTINGS/i })
      ).not.toBeInTheDocument();

      await user.clear(input);
      await user.type(input, "60");

      const saveButton = await screen.findByRole("button", { name: /SAVE SETTINGS/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockRemoteSettingsStore.updateSettings).toHaveBeenCalledWith(
          { TIMEOUT: "60" },
          expect.anything()
        );
      });
    });

    it("hides the save bar until there are unsaved edits", async () => {
      const mockSettings = [
        {
          package_name: "nodetool",
          env_var: "TIMEOUT",
          group: "Configuration",
          description: "Timeout",
          is_secret: false,
          value: "30",
          enum: null
        }
      ];
      mockRemoteSettingsStore.fetchSettings.mockResolvedValue(mockSettings);
      const user = userEvent.setup();

      render(<RemoteSettingsMenuComponent />, { wrapper });

      // No edits yet — sticky save bar is hidden.
      await waitFor(() => {
        expect(screen.getByDisplayValue("30")).toBeInTheDocument();
      });
      expect(
        screen.queryByRole("button", { name: /SAVE SETTINGS/i })
      ).not.toBeInTheDocument();

      // Edit a field — the bar appears.
      const input = screen.getByDisplayValue("30");
      await user.clear(input);
      await user.type(input, "45");
      expect(
        await screen.findByRole("button", { name: /SAVE SETTINGS/i })
      ).toBeInTheDocument();
    });
  });

  describe("Edge Cases", () => {
    it("should render component with mixed settings", async () => {
      const mockSettings = [
        {
          package_name: "nodetool",
          env_var: "SETTING1",
          group: "Group1",
          description: "Setting 1",
          is_secret: false,
          value: "value1",
          enum: null
        },
        {
          package_name: "nodetool",
          env_var: "SECRET1",
          group: "Group1",
          description: "Secret 1",
          is_secret: true,
          value: "********",
          enum: null
        }
      ];

      mockRemoteSettingsStore.fetchSettings.mockResolvedValue(mockSettings);

      render(<RemoteSettingsMenuComponent />, { wrapper });

      // Non-secret setting renders (secret filtered out)
      await waitFor(() => {
        expect(screen.getByDisplayValue("value1")).toBeInTheDocument();
      });
    });

    it("should render component with empty settings", async () => {
      mockRemoteSettingsStore.fetchSettings.mockResolvedValue([]);

      render(<RemoteSettingsMenuComponent />, { wrapper });

      // Component should render "No settings available" message
      await waitFor(() => {
        expect(screen.getByText("No settings available")).toBeInTheDocument();
      });
    });
  });

  describe("OAuth flows removed", () => {
    // Phase 1 moved the OpenAI / HuggingFace OAuth connect flows to the API
    // Keys tab. The Integrations panel must never render those affordances.
    it("renders no OAuth connect affordances", async () => {
      const mockSettings = [
        {
          package_name: "nodetool",
          env_var: "VLLM_BASE_URL",
          group: "vLLM",
          description: "vLLM endpoint",
          is_secret: false,
          value: "http://localhost:8000",
          enum: null
        }
      ];
      mockRemoteSettingsStore.fetchSettings.mockResolvedValue(mockSettings);

      render(<RemoteSettingsMenuComponent />, { wrapper });

      await waitFor(() => {
        expect(screen.getByDisplayValue("http://localhost:8000")).toBeInTheDocument();
      });

      // No OAuth sign-in / authentication sections belong here anymore.
      expect(screen.queryByText(/sign in with/i)).not.toBeInTheDocument();
      expect(
        screen.queryByText(/openai authentication/i)
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(/huggingface authentication/i)
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /disconnect/i })
      ).not.toBeInTheDocument();
    });
  });

  describe("Meta-section grouping", () => {
    // Registry groups map onto stable meta-section headings; the panel must
    // render those headings (not raw backend group names) and keep its order.
    it("groups registry settings under their meta-section headings", async () => {
      const mockSettings = [
        {
          package_name: "nodetool",
          env_var: "VLLM_BASE_URL",
          group: "vLLM",
          description: "vLLM endpoint",
          is_secret: false,
          value: "http://localhost:8000",
          enum: null
        },
        {
          package_name: "nodetool",
          env_var: "KIE_API_KEY",
          group: "KIE",
          description: "Kie.ai key",
          is_secret: false,
          value: "kie-value",
          enum: null
        },
        {
          package_name: "nodetool",
          env_var: "NODE_SUPABASE_URL",
          group: "NodeSupabase",
          description: "Supabase URL",
          is_secret: false,
          value: "https://supabase.co",
          enum: null
        }
      ];
      mockRemoteSettingsStore.fetchSettings.mockResolvedValue(mockSettings);

      render(<RemoteSettingsMenuComponent />, { wrapper });

      await waitFor(() => {
        expect(screen.getByDisplayValue("http://localhost:8000")).toBeInTheDocument();
      });

      // Meta-section headings render in the fixed order (the raw group names
      // "vLLM", "KIE", "NodeSupabase" must not appear as section headings).
      expect(screen.getByText("Local Model Servers")).toBeInTheDocument();
      expect(screen.getByText("Provider Options")).toBeInTheDocument();
      expect(screen.getByText("Data & Storage")).toBeInTheDocument();
    });

    it("renders unmapped registry groups under the catch-all Other section", async () => {
      const mockSettings = [
        {
          package_name: "nodetool",
          env_var: "SOMETHING_NEW",
          group: "SomethingNew",
          description: "A future registry group",
          is_secret: false,
          value: "value",
          enum: null
        }
      ];
      mockRemoteSettingsStore.fetchSettings.mockResolvedValue(mockSettings);

      render(<RemoteSettingsMenuComponent />, { wrapper });

      await waitFor(() => {
        expect(screen.getByText("Other")).toBeInTheDocument();
      });
    });
  });
});
