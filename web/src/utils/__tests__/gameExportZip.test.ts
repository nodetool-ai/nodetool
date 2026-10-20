import { restFetch } from "../../lib/rest-fetch";
import { saveResponseAsFile } from "../downloadResponse";
import { exportGameZip } from "../gameExportZip";

jest.mock("../../lib/rest-fetch", () => ({ restFetch: jest.fn() }));
jest.mock("../downloadResponse", () => ({ saveResponseAsFile: jest.fn() }));

const mockFetch = restFetch as jest.Mock;
const mockSave = saveResponseAsFile as jest.Mock;

beforeEach(() => {
  mockFetch.mockReset();
  mockSave.mockReset();
});

describe("exportGameZip", () => {
  it("requests the desktop export and saves it under the game name", async () => {
    const res = { ok: true, status: 200 };
    mockFetch.mockResolvedValue(res);
    await exportGameZip("a/b", "tauri", "Room: Escape");
    expect(mockFetch).toHaveBeenCalledWith("/api/games/a%2Fb/export-zip?target=tauri", { method: "GET" });
    expect(mockSave).toHaveBeenCalledWith(res, "Room_Escape-desktop.zip");
  });

  it("requests the mobile export and names it after the game", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    await exportGameZip("id", "expo", "Cave Run");
    expect(mockFetch.mock.calls[0][0]).toBe("/api/games/id/export-zip?target=expo");
    expect(mockSave.mock.calls[0][1]).toBe("Cave_Run-mobile.zip");
  });

  it("names a web export and falls back to 'game' for an empty name", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    await exportGameZip("id", "web", "");
    expect(mockFetch.mock.calls[0][0]).toBe("/api/games/id/export-zip?target=web");
    expect(mockSave.mock.calls[0][1]).toBe("game-web.zip");
  });

  it("throws the server's detail on failure", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 422, text: async () => JSON.stringify({ detail: "Missing asset for hero" }) });
    await expect(exportGameZip("id", "tauri", "x")).rejects.toThrow("Missing asset for hero");
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("throws plain response text when the body is not JSON", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, text: async () => "disk full" });
    await expect(exportGameZip("id", "web", "x")).rejects.toThrow("disk full");
  });
});
