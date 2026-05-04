import { downloadFile } from "../download";
import { EventEmitter } from "events";

jest.mock("fs", () => {
  const actual = jest.requireActual("fs");
  return {
    ...actual,
    constants: actual.constants,
    promises: {
      stat: jest.fn(),
      access: jest.fn(),
      unlink: jest.fn().mockResolvedValue(undefined)
    },
    createWriteStream: jest.fn()
  };
});

jest.mock("https", () => ({
  request: jest.fn(),
  get: jest.fn()
}));

jest.mock("../logger", () => ({
  logMessage: jest.fn()
}));
jest.mock("../events", () => ({
  emitUpdateProgress: jest.fn()
}));
jest.mock("../utils", () => ({
  checkPermissions: jest.fn().mockResolvedValue({ accessible: true, error: null })
}));

import { promises as fs } from "fs";
import * as https from "https";

const mockFs = fs as jest.Mocked<typeof fs>;
const mockRequest = https.request as jest.MockedFunction<typeof https.request>;

function createMockRequest() {
  const req = new EventEmitter();
  (req as any).end = jest.fn();
  (req as any).destroy = jest.fn();
  return req;
}

describe("downloadFile", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("skips download when existing file matches expected size", async () => {
    const mockReq = createMockRequest();
    mockRequest.mockImplementation((_url: any, _opts: any, cb: any) => {
      // Simulate HEAD response with content-length
      process.nextTick(() => {
        cb({
          statusCode: 200,
          headers: { "content-length": "1024" }
        });
      });
      return mockReq as any;
    });

    mockFs.stat.mockResolvedValue({ size: 1024 } as any);

    await downloadFile("https://example.com/file.bin", "/tmp/file.bin");

    // If size matches, should NOT start a download via https.get
    expect(https.get).not.toHaveBeenCalled();
  });

  it("throws when destination directory is not writable", async () => {
    const { checkPermissions } = require("../utils");
    (checkPermissions as jest.Mock).mockResolvedValueOnce({
      accessible: false,
      error: "Permission denied"
    });

    await expect(
      downloadFile("https://example.com/file.bin", "/protected/file.bin")
    ).rejects.toThrow("Cannot write to download directory");
  });

  it("throws when HEAD request cannot determine file size", async () => {
    const mockReq = createMockRequest();
    mockRequest.mockImplementation((_url: any, _opts: any, cb: any) => {
      process.nextTick(() => {
        cb({
          statusCode: 200,
          headers: {}
        });
      });
      return mockReq as any;
    });

    await expect(
      downloadFile("https://example.com/file.bin", "/tmp/file.bin")
    ).rejects.toThrow("Could not determine file size");
  });

  it("throws when HEAD request encounters network error", async () => {
    const mockReq = createMockRequest();
    mockRequest.mockImplementation(() => {
      process.nextTick(() => {
        mockReq.emit("error", new Error("ECONNREFUSED"));
      });
      return mockReq as any;
    });

    await expect(
      downloadFile("https://example.com/file.bin", "/tmp/file.bin")
    ).rejects.toThrow("ECONNREFUSED");
  });

  it("follows redirects in HEAD request", async () => {
    const mockReq1 = createMockRequest();
    const mockReq2 = createMockRequest();

    let callCount = 0;
    mockRequest.mockImplementation((_url: any, _opts: any, cb: any) => {
      callCount++;
      if (callCount === 1) {
        process.nextTick(() => {
          cb({
            statusCode: 302,
            headers: { location: "https://cdn.example.com/file.bin" }
          });
        });
        return mockReq1 as any;
      }
      process.nextTick(() => {
        cb({
          statusCode: 200,
          headers: { "content-length": "2048" }
        });
      });
      return mockReq2 as any;
    });

    // File exists with matching size — skip download
    mockFs.stat.mockResolvedValue({ size: 2048 } as any);

    await downloadFile("https://example.com/file.bin", "/tmp/file.bin");

    expect(mockRequest).toHaveBeenCalledTimes(2);
  });
});
