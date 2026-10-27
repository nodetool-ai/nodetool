import { writeScriptStoryboardId } from "../scriptStoryboardBackpointer";

const mockGet = jest.fn();
const mockUpdate = jest.fn();
const mockSetServerRevision = jest.fn();
const mockSetStoryboardLink = jest.fn();

jest.mock("../../trpc/client", () => ({
  trpcClient: {
    scripts: {
      get: { query: (...args: unknown[]) => mockGet(...args) },
      update: { mutate: (...args: unknown[]) => mockUpdate(...args) }
    }
  }
}));
jest.mock("../../stores/script/ScriptStore", () => ({
  useScriptStore: {
    getState: () => ({
      setServerRevision: mockSetServerRevision,
      setStoryboardLink: mockSetStoryboardLink
    })
  }
}));

describe("writeScriptStoryboardId", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue({ updatedAt: "t1" });
    mockUpdate.mockResolvedValue({ updatedAt: "t2" });
  });

  it("patches against the current revision and mirrors the result into the store", async () => {
    await writeScriptStoryboardId("s1", "b1");

    expect(mockGet).toHaveBeenCalledWith({ id: "s1" });
    expect(mockUpdate).toHaveBeenCalledWith({
      id: "s1",
      baseUpdatedAt: "t1",
      storyboardId: "b1"
    });
    expect(mockSetServerRevision).toHaveBeenCalledWith("s1", "t2");
    expect(mockSetStoryboardLink).toHaveBeenCalledWith("s1", "b1");
  });

  it("clears the link with null", async () => {
    await writeScriptStoryboardId("s1", null);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ storyboardId: null })
    );
    expect(mockSetStoryboardLink).toHaveBeenCalledWith("s1", null);
  });

  it("leaves the store untouched when the patch fails", async () => {
    mockUpdate.mockRejectedValue(new Error("conflict"));

    await expect(writeScriptStoryboardId("s1", "b1")).rejects.toThrow(
      "conflict"
    );
    expect(mockSetServerRevision).not.toHaveBeenCalled();
    expect(mockSetStoryboardLink).not.toHaveBeenCalled();
  });
});
