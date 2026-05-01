import { act } from "@testing-library/react";
import { restFetch } from "../../lib/rest-fetch";
import { trpcClient } from "../../trpc/client";
import { useCollectionStore } from "../CollectionStore";

jest.mock("../../trpc/client", () => ({
  trpcClient: {
    collections: {
      list: { query: jest.fn() },
      delete: { mutate: jest.fn() }
    }
  }
}));

jest.mock("../../lib/rest-fetch", () => ({
  restFetch: jest.fn()
}));

const listQuery = trpcClient.collections.list.query as jest.Mock;
const mockRestFetch = restFetch as jest.Mock;

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

    mockRestFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ path: "/test.txt" })
    });
    listQuery.mockResolvedValue({ collections: [], count: 0 });

    const handler = useCollectionStore.getState().handleDrop("collection1");

    await act(async () => {
      await handler(mockEvent);
    });

    expect(mockRestFetch).toHaveBeenCalledTimes(3);
    expect(listQuery).toHaveBeenCalledTimes(1);
  });
});
