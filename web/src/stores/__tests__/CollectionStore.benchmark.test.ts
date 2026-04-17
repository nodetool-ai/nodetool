
import { act } from "@testing-library/react";
import { useCollectionStore } from "../CollectionStore";

// Mock the tRPC client for list/delete.
jest.mock("../../trpc/client", () => ({
  trpcClient: {
    collections: {
      list: { query: jest.fn() },
      delete: { mutate: jest.fn() }
    }
  }
}));

// Multipart upload still uses the openapi-fetch client.
jest.mock("../ApiClient", () => ({
  client: {
    POST: jest.fn()
  }
}));

import { trpcClient } from "../../trpc/client";
import { client } from "../ApiClient";

const listQuery = trpcClient.collections.list.query as jest.Mock;
const mockClient = client as unknown as { POST: jest.Mock };

describe("CollectionStore Benchmark", () => {
  beforeEach(() => {
    useCollectionStore.setState({
      collections: null,
      isLoading: false,
      error: null,
      deleteTarget: null,
      showForm: false,
      dragOverCollection: null,
      indexProgress: null,
      indexErrors: [],
      selectedCollections: []
    });
    jest.clearAllMocks();
  });

  it("reproduction: should call fetchCollections multiple times for multiple files", async () => {
    const mockFile1 = new File(["content1"], "test1.txt", { type: "text/plain" });
    const mockFile2 = new File(["content2"], "test2.txt", { type: "text/plain" });
    const mockFile3 = new File(["content3"], "test3.txt", { type: "text/plain" });

    const mockEvent = {
      preventDefault: jest.fn(),
      dataTransfer: {
        files: [mockFile1, mockFile2, mockFile3]
      }
    } as unknown as React.DragEvent<HTMLDivElement>;

    mockClient.POST.mockResolvedValue({ data: { path: "/test.txt" }, error: null });
    listQuery.mockResolvedValue({ collections: [], count: 0 });

    const handler = useCollectionStore.getState().handleDrop("collection1");

    await act(async () => {
      await handler(mockEvent);
    });

    // POST is called for every file upload (3 times).
    expect(mockClient.POST).toHaveBeenCalledTimes(3);

    // After optimization, collections.list should be called only once for the entire batch.
    expect(listQuery).toHaveBeenCalledTimes(1);
  });
});
