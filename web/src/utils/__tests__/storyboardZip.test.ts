import { restFetch } from "../../lib/rest-fetch";
import { saveResponseAsFile } from "../downloadResponse";
import { exportStoryboardZip } from "../storyboardZip";

jest.mock("../../lib/rest-fetch", () => ({ restFetch: jest.fn() }));
jest.mock("../downloadResponse", () => ({ saveResponseAsFile: jest.fn() }));

const mockFetch = restFetch as jest.Mock;
const mockSave = saveResponseAsFile as jest.Mock;

beforeEach(() => {
  mockFetch.mockReset();
  mockSave.mockReset();
});

describe("exportStoryboardZip", () => {
  it("requests the encoded export path and saves under a sanitized name", async () => {
    const res = { ok: true, status: 200 };
    mockFetch.mockResolvedValue(res);

    await exportStoryboardZip("a/b c", "My Board: v2");

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/storyboards/a%2Fb%20c/export-zip",
      { method: "GET" }
    );
    expect(mockSave).toHaveBeenCalledWith(res, "My_Board_v2.zip");
  });

  it("keeps dots, dashes and underscores in the name", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    await exportStoryboardZip("id", "cut_1.2-final");
    expect(mockSave.mock.calls[0][1]).toBe("cut_1.2-final.zip");
  });

  it("falls back to 'storyboard' when the name is empty", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    await exportStoryboardZip("id", "");
    expect(mockSave.mock.calls[0][1]).toBe("storyboard.zip");
  });

  it("throws the response text on failure", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "disk full"
    });
    await expect(exportStoryboardZip("id", "x")).rejects.toThrow("disk full");
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("throws a status message when the error body is empty or unreadable", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => {
        throw new Error("boom");
      }
    });
    await expect(exportStoryboardZip("id", "x")).rejects.toThrow(
      "Download failed (404)"
    );
  });
});
