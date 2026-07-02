jest.mock("../browser", () => ({ isElectron: true }));

import {
  getLocalFilePath,
  pathToFileUri,
  fileUriToPath,
  isFileUri,
  fileUriToHttpUrl
} from "../localFile";

describe("pathToFileUri", () => {
  it("builds a file:// URI from a POSIX path", () => {
    expect(pathToFileUri("/Users/me/pic.png")).toBe("file:///Users/me/pic.png");
  });

  it("adds the leading slash for Windows drive paths", () => {
    expect(pathToFileUri("C:\\Users\\me\\pic.png")).toBe(
      "file:///C:/Users/me/pic.png"
    );
  });

  it("escapes spaces and other unsafe characters", () => {
    expect(pathToFileUri("/Users/me/my pic.png")).toBe(
      "file:///Users/me/my%20pic.png"
    );
    expect(pathToFileUri("/Users/me/a#b?.png")).toBe(
      "file:///Users/me/a%23b%3F.png"
    );
  });
});

describe("fileUriToPath", () => {
  it("round-trips a POSIX path", () => {
    const uri = pathToFileUri("/Users/me/my pic.png");
    expect(fileUriToPath(uri)).toBe("/Users/me/my pic.png");
  });

  it("round-trips a Windows drive path", () => {
    const uri = pathToFileUri("C:\\Users\\me\\my pic.png");
    expect(fileUriToPath(uri)).toBe("C:/Users/me/my pic.png");
  });
});

describe("isFileUri", () => {
  it("matches only file:// URIs", () => {
    expect(isFileUri("file:///a.png")).toBe(true);
    expect(isFileUri("asset://abc")).toBe(false);
    expect(isFileUri("http://x/y.png")).toBe(false);
    expect(isFileUri(undefined)).toBe(false);
    expect(isFileUri(null)).toBe(false);
  });
});

describe("fileUriToHttpUrl", () => {
  it("maps a file:// URI to the backend streaming endpoint", () => {
    expect(fileUriToHttpUrl("file:///Users/me/song.mp3")).toBe(
      "http://localhost:7777/api/files/local?path=%2FUsers%2Fme%2Fsong.mp3"
    );
  });

  it("encodes spaces and other unsafe characters in the path", () => {
    expect(fileUriToHttpUrl("file:///Users/me/Kreuzberg%20Neon.mp3")).toBe(
      "http://localhost:7777/api/files/local?path=%2FUsers%2Fme%2FKreuzberg%20Neon.mp3"
    );
  });

  it("returns null for non-file URIs", () => {
    expect(fileUriToHttpUrl("http://example.com/a.mp3")).toBeNull();
    expect(fileUriToHttpUrl("asset://abc")).toBeNull();
    expect(fileUriToHttpUrl(undefined)).toBeNull();
    expect(fileUriToHttpUrl(null)).toBeNull();
  });
});

describe("getLocalFilePath", () => {
  const file = new File(["x"], "pic.png", { type: "image/png" });

  afterEach(() => {
    delete (window as unknown as { api?: unknown }).api;
  });

  it("returns the resolved path from the Electron bridge", () => {
    (window as unknown as { api: unknown }).api = {
      files: { getPathForFile: () => "/Users/me/pic.png" }
    };
    expect(getLocalFilePath(file)).toBe("/Users/me/pic.png");
  });

  it("returns null when the bridge yields an empty path", () => {
    (window as unknown as { api: unknown }).api = {
      files: { getPathForFile: () => "" }
    };
    expect(getLocalFilePath(file)).toBeNull();
  });

  it("returns null when the bridge is unavailable", () => {
    expect(getLocalFilePath(file)).toBeNull();
  });
});
