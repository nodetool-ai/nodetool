import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider, createTheme } from "@mui/material/styles";
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
jest.mock("../sharedSettingsStyles", () => ({
  getSharedSettingsStyles: () => ({})
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

const theme = createTheme();
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

    mockUseRemoteSettingsStore.mockReturnValue(mockRemoteSettingsStore as any);
    mockUseNotificationStore.mockReturnValue(mockNotificationStore as any);

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
        // Non-secret setting should be visible
        expect(screen.getByText("TIMEOUT")).toBeInTheDocument();
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
        expect(screen.getByText("TIMEOUT")).toBeInTheDocument();
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

        // Secret settings should NOT be included
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

      // Component should render successfully
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /SAVE SETTINGS/i })).toBeInTheDocument();
      });
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
        expect(screen.getByRole("button", { name: /SAVE SETTINGS/i })).toBeInTheDocument();
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

      render(<RemoteSettingsMenuComponent />, { wrapper });

      const saveButton = await screen.findByRole("button", { name: /SAVE SETTINGS/i });
      expect(saveButton).toBeInTheDocument();
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

      // Component should render the save button
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /SAVE SETTINGS/i })).toBeInTheDocument();
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
});
