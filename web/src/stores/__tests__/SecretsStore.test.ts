import { renderHook, act } from "@testing-library/react";
import useSecretsStore from "../SecretsStore";

// Mock the tRPC client used by the store. Only the leaf methods invoked by
// the store need to exist; we replace them with Jest mock fns per-test.
jest.mock("../../trpc/client", () => ({
  trpcClient: {
    settings: {
      secrets: {
        list: { query: jest.fn() },
        get: { query: jest.fn() },
        upsert: { mutate: jest.fn() },
        delete: { mutate: jest.fn() }
      }
    }
  }
}));

import { trpcClient } from "../../trpc/client";
// Cast so we can read the Jest mock APIs on the nested procedures without
// sprinkling `as any` in every test.
const listQuery = trpcClient.settings.secrets.list.query as jest.Mock;
const upsertMutate = trpcClient.settings.secrets.upsert.mutate as jest.Mock;
const deleteMutate = trpcClient.settings.secrets.delete.mutate as jest.Mock;

describe("SecretsStore", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

      listQuery.mockResolvedValueOnce({ secrets: mockSecrets, next_key: null });

      const { result } = renderHook(() => useSecretsStore());

      let secrets;
      await act(async () => {
        secrets = await result.current.fetchSecrets(100);
      });

      expect(secrets).toEqual(mockSecrets);
      expect(result.current.secrets).toEqual(mockSecrets);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(listQuery).toHaveBeenCalled();
    });

    it("should handle fetch with custom limit (limit ignored by tRPC)", async () => {
      listQuery.mockResolvedValueOnce({ secrets: [], next_key: null });

      const { result } = renderHook(() => useSecretsStore());

      await act(async () => {
        await result.current.fetchSecrets(50);
      });

      // The tRPC procedure does not accept a limit — we just verify it was called.
      expect(listQuery).toHaveBeenCalled();
    });

    it("should handle fetch error", async () => {
      listQuery.mockRejectedValueOnce(new Error("Failed to fetch secrets"));

      const { result } = renderHook(() => useSecretsStore());

      await act(async () => {
        try {
          await result.current.fetchSecrets();
        } catch (_) {
          // Error is expected
        }
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeTruthy();
    });
  });

  describe("updateSecret", () => {
    it("should update a secret successfully", async () => {
      upsertMutate.mockResolvedValueOnce({
        key: "OPENAI_API_KEY",
        is_configured: true,
        is_unreadable: false
      });
      listQuery.mockResolvedValueOnce({ secrets: [], next_key: null });

      const { result } = renderHook(() => useSecretsStore());

      await act(async () => {
        await result.current.updateSecret(
          "OPENAI_API_KEY",
          "new_value",
          "Updated description"
        );
      });

      expect(upsertMutate).toHaveBeenCalledWith({
        key: "OPENAI_API_KEY",
        value: "new_value",
        description: "Updated description"
      });
      // Should refresh secrets after update
      expect(listQuery).toHaveBeenCalled();
    });

    it("should update secret without description", async () => {
      upsertMutate.mockResolvedValueOnce({
        key: "ANTHROPIC_API_KEY",
        is_configured: true,
        is_unreadable: false
      });
      listQuery.mockResolvedValueOnce({ secrets: [], next_key: null });

      const { result } = renderHook(() => useSecretsStore());

      await act(async () => {
        await result.current.updateSecret("ANTHROPIC_API_KEY", "new_value");
      });

      expect(upsertMutate).toHaveBeenCalledWith({
        key: "ANTHROPIC_API_KEY",
        value: "new_value"
      });
    });

    it("should handle update error", async () => {
      upsertMutate.mockRejectedValueOnce(new Error("Secret not found"));

      const { result } = renderHook(() => useSecretsStore());

      await act(async () => {
        try {
          await result.current.updateSecret("NONEXISTENT_KEY", "value");
        } catch (_) {
          // Error is expected
        }
      });

      expect(result.current.error).toBeTruthy();
    });
  });

  describe("deleteSecret", () => {
    it("should delete a secret successfully", async () => {
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

      deleteMutate.mockResolvedValueOnce({ message: "Secret deleted" });
      listQuery.mockResolvedValueOnce({ secrets: [], next_key: null });

      const { result } = renderHook(() => useSecretsStore());

      await act(async () => {
        await result.current.deleteSecret("OPENAI_API_KEY");
      });

      expect(deleteMutate).toHaveBeenCalledWith({ key: "OPENAI_API_KEY" });
      // Should refresh secrets after deletion
      expect(listQuery).toHaveBeenCalled();
    });

    it("should handle deletion error", async () => {
      deleteMutate.mockRejectedValueOnce(new Error("Secret not found"));

      const { result } = renderHook(() => useSecretsStore());

      await act(async () => {
        try {
          await result.current.deleteSecret("NONEXISTENT_KEY");
        } catch (_) {
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

      listQuery.mockResolvedValueOnce({ secrets: [], next_key: null });

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

      upsertMutate.mockRejectedValueOnce(new Error("Failed to update"));

      const { result } = renderHook(() => useSecretsStore());

      await act(async () => {
        try {
          await result.current.updateSecret("OPENAI_API_KEY", "new_value");
        } catch (_) {
          // Error is expected
        }
      });

      expect(result.current.secrets).toEqual(initialSecrets);
    });
  });
});
