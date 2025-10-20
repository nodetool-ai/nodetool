import { renderHook, act, waitFor } from "@testing-library/react";
import useSecretsStore from "../SecretsStore";
import * as ApiClient from "../ApiClient";

// Mock the API client
jest.mock("../ApiClient");

const mockClient = ApiClient.client as jest.Mocked<typeof ApiClient.client>;

describe("SecretsStore", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset store state
    useSecretsStore.setState({
      secrets: [],
      isLoading: false,
      error: null
    });
  });

  describe("fetchSecrets", () => {
    it("should fetch secrets successfully", async () => {
      const mockSecrets = [
        {
          id: "1",
          user_id: "user1",
          key: "OPENAI_API_KEY",
          description: "OpenAI API key",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
          is_configured: true
        },
        {
          id: "2",
          user_id: "user1",
          key: "ANTHROPIC_API_KEY",
          description: "Anthropic API key",
          created_at: "2024-01-02T00:00:00Z",
          updated_at: "2024-01-02T00:00:00Z",
          is_configured: false
        }
      ];

      mockClient.GET.mockResolvedValueOnce({
        error: null,
        data: { secrets: mockSecrets, next_key: null }
      });

      const { result } = renderHook(() => useSecretsStore());

      let secrets;
      await act(async () => {
        secrets = await result.current.fetchSecrets(100);
      });

      expect(secrets).toEqual(mockSecrets);
      expect(result.current.secrets).toEqual(mockSecrets);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(mockClient.GET).toHaveBeenCalledWith("/api/settings/secrets", {
        params: {
          query: {
            limit: 100
          }
        }
      });
    });

    it("should handle fetch with custom limit", async () => {
      const mockSecrets = [];
      mockClient.GET.mockResolvedValueOnce({
        error: null,
        data: { secrets: mockSecrets, next_key: "next_page_key" }
      });

      const { result } = renderHook(() => useSecretsStore());

      await act(async () => {
        await result.current.fetchSecrets(50);
      });

      expect(mockClient.GET).toHaveBeenCalledWith("/api/settings/secrets", {
        params: {
          query: {
            limit: 50
          }
        }
      });
    });

    it("should handle fetch error", async () => {
      const errorResponse = {
        error: { detail: "Failed to fetch secrets" },
        data: null
      };

      mockClient.GET.mockResolvedValueOnce(errorResponse);

      const { result } = renderHook(() => useSecretsStore());

      await act(async () => {
        try {
          await result.current.fetchSecrets();
        } catch (error) {
          // Error is expected
        }
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeTruthy();
    });
  });

  describe("updateSecret", () => {
    it("should update a secret successfully", async () => {
      mockClient.PUT.mockResolvedValueOnce({
        error: null,
        data: {}
      });

      mockClient.GET.mockResolvedValueOnce({
        error: null,
        data: { secrets: [], next_key: null }
      });

      const { result } = renderHook(() => useSecretsStore());

      await act(async () => {
        await result.current.updateSecret("OPENAI_API_KEY", "new_value", "Updated description");
      });

      expect(mockClient.PUT).toHaveBeenCalledWith("/api/settings/secrets/{key}", {
        params: {
          path: {
            key: "OPENAI_API_KEY"
          }
        },
        body: {
          value: "new_value",
          description: "Updated description"
        }
      });

      // Should fetch secrets after update
      expect(mockClient.GET).toHaveBeenCalled();
    });

    it("should update secret without description", async () => {
      mockClient.PUT.mockResolvedValueOnce({
        error: null,
        data: {}
      });

      mockClient.GET.mockResolvedValueOnce({
        error: null,
        data: { secrets: [], next_key: null }
      });

      const { result } = renderHook(() => useSecretsStore());

      await act(async () => {
        await result.current.updateSecret("ANTHROPIC_API_KEY", "new_value");
      });

      expect(mockClient.PUT).toHaveBeenCalledWith("/api/settings/secrets/{key}", {
        params: {
          path: {
            key: "ANTHROPIC_API_KEY"
          }
        },
        body: {
          value: "new_value",
          description: undefined
        }
      });
    });

    it("should handle update error", async () => {
      mockClient.PUT.mockResolvedValueOnce({
        error: { detail: "Secret not found" },
        data: null
      });

      const { result } = renderHook(() => useSecretsStore());

      await act(async () => {
        try {
          await result.current.updateSecret("NONEXISTENT_KEY", "value");
        } catch (error) {
          // Error is expected
        }
      });

      expect(result.current.error).toBeTruthy();
    });
  });

  describe("deleteSecret", () => {
    it("should delete a secret successfully", async () => {
      // Set initial state
      useSecretsStore.setState({
        secrets: [
          {
            id: "1",
            user_id: "user1",
            key: "OPENAI_API_KEY",
            description: "OpenAI API key",
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-01T00:00:00Z",
            is_configured: true
          }
        ]
      });

      mockClient.DELETE.mockResolvedValueOnce({
        error: null,
        data: { message: "Secret deleted" }
      });

      mockClient.GET.mockResolvedValueOnce({
        error: null,
        data: { secrets: [], next_key: null }
      });

      const { result } = renderHook(() => useSecretsStore());

      await act(async () => {
        await result.current.deleteSecret("OPENAI_API_KEY");
      });

      expect(mockClient.DELETE).toHaveBeenCalledWith("/api/settings/secrets/{key}", {
        params: {
          path: {
            key: "OPENAI_API_KEY"
          }
        }
      });

      // Should fetch secrets after deletion
      expect(mockClient.GET).toHaveBeenCalled();
    });

    it("should handle deletion error", async () => {
      mockClient.DELETE.mockResolvedValueOnce({
        error: { detail: "Secret not found" },
        data: null
      });

      const { result } = renderHook(() => useSecretsStore());

      await act(async () => {
        try {
          await result.current.deleteSecret("NONEXISTENT_KEY");
        } catch (error) {
          // Error is expected
        }
      });

      expect(result.current.error).toBeTruthy();
    });
  });

  describe("Store State Management", () => {
    it("should initialize with correct default state", () => {
      const { result } = renderHook(() => useSecretsStore());

      expect(result.current.secrets).toEqual([]);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it("should clear error state when performing new operation", async () => {
      useSecretsStore.setState({ error: "Previous error" });

      mockClient.GET.mockResolvedValueOnce({
        error: null,
        data: { secrets: [], next_key: null }
      });

      const { result } = renderHook(() => useSecretsStore());

      await act(async () => {
        await result.current.fetchSecrets();
      });

      expect(result.current.error).toBeNull();
    });

    it("should not modify secrets on update error", async () => {
      const initialSecrets = [
        {
          id: "1",
          user_id: "user1",
          key: "OPENAI_API_KEY",
          description: "OpenAI API key",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
          is_configured: true
        }
      ];

      useSecretsStore.setState({ secrets: initialSecrets });

      mockClient.PUT.mockResolvedValueOnce({
        error: { detail: "Failed to update" },
        data: null
      });

      const { result } = renderHook(() => useSecretsStore());

      await act(async () => {
        try {
          await result.current.updateSecret("OPENAI_API_KEY", "new_value");
        } catch (error) {
          // Error is expected
        }
      });

      expect(result.current.secrets).toEqual(initialSecrets);
    });
  });
});
