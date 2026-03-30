
import { act } from "@testing-library/react";
import { useCollectionStore } from "../CollectionStore";
import { client } from "../ApiClient";

// Mock the client module
jest.mock("../ApiClient", () => ({
  client: {
    GET: jest.fn(),
    POST: jest.fn(),
    DELETE: jest.fn()
  }
}));

// Use 'any' to bypass strict typing for mocked API responses
const mockClient = client as any;

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
    mockClient.GET.mockResolvedValue({ data: { collections: [] }, error: null });

    const handler = useCollectionStore.getState().handleDrop("collection1");

    await act(async () => {
      await handler(mockEvent);
    });

    // POST is called for every file upload (3 times).
    expect(mockClient.POST).toHaveBeenCalledTimes(3);

    // After optimization, GET should be called only once for the entire batch.
    expect(mockClient.GET).toHaveBeenCalledTimes(1);
  });
});
