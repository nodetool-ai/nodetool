import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";

const versionsQuery = jest.fn();
const createVersionMutate = jest.fn();
const renameVersionMutate = jest.fn();
const deleteVersionMutate = jest.fn();
const restoreMutate = jest.fn();

jest.mock("../../trpc/client", () => ({
  trpcClient: {
    textDocuments: {
      versions: { query: (input: unknown) => versionsQuery(input) },
      createVersion: { mutate: (input: unknown) => createVersionMutate(input) },
      renameVersion: { mutate: (input: unknown) => renameVersionMutate(input) },
      deleteVersion: { mutate: (input: unknown) => deleteVersionMutate(input) },
      restore: { mutate: (input: unknown) => restoreMutate(input) }
    }
  }
}));

import {
  savePreTurnVersion,
  useTextDocumentVersions
} from "../useTextDocumentVersions";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { wrapper, invalidateSpy };
}

beforeEach(() => {
  jest.clearAllMocks();
  versionsQuery.mockResolvedValue({ versions: [] });
});

describe("useTextDocumentVersions", () => {
  it("renames a version and invalidates textDocuments queries", async () => {
    renameVersionMutate.mockResolvedValue({ version: { version: 2, name: "Final" } });
    const { wrapper, invalidateSpy } = createWrapper();
    const { result } = renderHook(() => useTextDocumentVersions("doc-1"), { wrapper });

    await act(async () => {
      await result.current.renameVersion(2, "  Final  ");
    });

    expect(renameVersionMutate).toHaveBeenCalledWith({
      asset_id: "doc-1",
      version: 2,
      name: "Final"
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["textDocuments", "doc-1"]
    });
  });

  it("clears the version name when given whitespace or null", async () => {
    renameVersionMutate.mockResolvedValue({ version: { version: 2, name: null } });
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useTextDocumentVersions("doc-1"), { wrapper });

    await act(async () => {
      await result.current.renameVersion(2, "   ");
      await result.current.renameVersion(2, null);
    });

    expect(renameVersionMutate).toHaveBeenNthCalledWith(1, {
      asset_id: "doc-1",
      version: 2,
      name: null
    });
    expect(renameVersionMutate).toHaveBeenNthCalledWith(2, {
      asset_id: "doc-1",
      version: 2,
      name: null
    });
  });

  it("deletes a version and invalidates textDocuments queries", async () => {
    deleteVersionMutate.mockResolvedValue({ deleted_version: 3 });
    const { wrapper, invalidateSpy } = createWrapper();
    const { result } = renderHook(() => useTextDocumentVersions("doc-1"), { wrapper });

    await act(async () => {
      await result.current.deleteVersion(3);
    });

    expect(deleteVersionMutate).toHaveBeenCalledWith({
      asset_id: "doc-1",
      version: 3
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["textDocuments", "doc-1"]
    });
  });
});

describe("savePreTurnVersion", () => {
  it("creates an agent_turn version for the document", async () => {
    createVersionMutate.mockResolvedValue({ version: { version: 4 } });

    await savePreTurnVersion("doc-9");

    expect(createVersionMutate).toHaveBeenCalledWith({
      asset_id: "doc-9",
      save_type: "agent_turn"
    });
  });
});
