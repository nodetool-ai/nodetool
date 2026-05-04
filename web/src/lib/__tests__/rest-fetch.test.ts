/**
 * @jest-environment node
 */

const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

let mockIsLocalhost = false;

jest.mock("../auth", () => ({
  authHeader: jest.fn()
}));

jest.mock("../env", () => ({
  get isLocalhost() {
    return mockIsLocalhost;
  }
}));

jest.mock("../../stores/BASE_URL", () => ({
  BASE_URL: "http://api.example.com"
}));

import { restFetch } from "../rest-fetch";
import { authHeader } from "../auth";

const mockAuthHeader = authHeader as jest.MockedFunction<typeof authHeader>;

describe("restFetch", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue(new Response("ok"));
    mockIsLocalhost = false;
  });

  describe("URL construction", () => {
    it("prepends BASE_URL to string paths", async () => {
      mockAuthHeader.mockResolvedValue({ Authorization: "Bearer token" });
      await restFetch("/api/workflows");

      expect(mockFetch).toHaveBeenCalledWith(
        "http://api.example.com/api/workflows",
        expect.any(Object)
      );
    });

    it("passes URL objects through unchanged", async () => {
      mockAuthHeader.mockResolvedValue({});
      const url = new URL("http://other.com/path");
      await restFetch(url);

      expect(mockFetch).toHaveBeenCalledWith(url, expect.any(Object));
    });
  });

  describe("auth headers", () => {
    it("includes auth headers when not localhost", async () => {
      mockIsLocalhost = false;
      mockAuthHeader.mockResolvedValue({
        Authorization: "Bearer test-token"
      });

      await restFetch("/api/data");

      expect(mockAuthHeader).toHaveBeenCalled();
      const calledInit = mockFetch.mock.calls[0][1];
      const headers = calledInit.headers as Headers;
      expect(headers.get("Authorization")).toBe("Bearer test-token");
    });

    it("skips auth headers when in localhost mode", async () => {
      mockIsLocalhost = true;

      await restFetch("/api/data");

      expect(mockAuthHeader).not.toHaveBeenCalled();
    });
  });

  describe("request options", () => {
    it("passes through init options", async () => {
      mockAuthHeader.mockResolvedValue({});
      await restFetch("/api/data", {
        method: "POST",
        body: JSON.stringify({ key: "value" })
      });

      const calledInit = mockFetch.mock.calls[0][1];
      expect(calledInit.method).toBe("POST");
      expect(calledInit.body).toBe(JSON.stringify({ key: "value" }));
    });

    it("merges custom headers with auth headers", async () => {
      mockIsLocalhost = false;
      mockAuthHeader.mockResolvedValue({
        Authorization: "Bearer token"
      });

      await restFetch("/api/data", {
        headers: { "Content-Type": "application/json" }
      });

      const calledInit = mockFetch.mock.calls[0][1];
      const headers = calledInit.headers as Headers;
      expect(headers.get("Content-Type")).toBe("application/json");
      expect(headers.get("Authorization")).toBe("Bearer token");
    });
  });
});
