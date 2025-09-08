import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import axios from "axios";
import { fetchHuggingFaceRepoInfo } from "../huggingFaceUtils";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("huggingFaceUtils", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("fetchHuggingFaceRepoInfo", () => {
    it("should fetch repo info successfully", async () => {
      const mockRepoData = {
        id: "meta-llama/Llama-2-7b",
        modelId: "meta-llama/Llama-2-7b",
        author: "meta-llama",
        sha: "abc123",
        lastModified: "2023-01-01T00:00:00.000Z",
        private: false,
        disabled: false,
        gated: false,
        tags: ["pytorch", "transformers", "llama"],
        pipeline_tag: "text-generation",
        cardData: {},
        siblings: []
      };

      mockedAxios.get.mockResolvedValueOnce({ data: mockRepoData });

      const result = await fetchHuggingFaceRepoInfo("meta-llama/Llama-2-7b");
      
      expect(result).toEqual(mockRepoData);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        "https://huggingface.co/api/models/meta-llama/Llama-2-7b?blobs=true",
        { timeout: 8000 }
      );
    });

    it("should handle network errors gracefully", async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error("Network error"));

      const result = await fetchHuggingFaceRepoInfo("test/model");
      
      expect(result).toBeNull();
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });

    it("should handle 404 errors", async () => {
      const axiosError = new Error("Not found") as any;
      axiosError.response = { status: 404, data: "Not found" };
      mockedAxios.get.mockRejectedValueOnce(axiosError);

      const result = await fetchHuggingFaceRepoInfo("nonexistent/model");
      
      expect(result).toBeNull();
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });

    it("should handle timeout errors", async () => {
      const timeoutError = new Error("timeout") as any;
      timeoutError.code = "ECONNABORTED";
      mockedAxios.get.mockRejectedValueOnce(timeoutError);

      const result = await fetchHuggingFaceRepoInfo("slow/model");
      
      expect(result).toBeNull();
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });

    it("should handle models with special characters in repo ID", async () => {
      const mockRepoData = { id: "user-name/model.name-v1.0" };
      mockedAxios.get.mockResolvedValueOnce({ data: mockRepoData });

      const result = await fetchHuggingFaceRepoInfo("user-name/model.name-v1.0");
      
      expect(result).toEqual(mockRepoData);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        "https://huggingface.co/api/models/user-name/model.name-v1.0?blobs=true",
        { timeout: 8000 }
      );
    });

    it("should handle server errors (5xx)", async () => {
      const serverError = new Error("Internal Server Error") as any;
      serverError.response = { status: 500, data: "Internal Server Error" };
      mockedAxios.get.mockRejectedValueOnce(serverError);

      const result = await fetchHuggingFaceRepoInfo("test/model");
      
      expect(result).toBeNull();
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });

    it("should handle rate limiting (429)", async () => {
      const rateLimitError = new Error("Too Many Requests") as any;
      rateLimitError.response = { status: 429, data: "Rate limit exceeded" };
      mockedAxios.get.mockRejectedValueOnce(rateLimitError);

      const result = await fetchHuggingFaceRepoInfo("test/model");
      
      expect(result).toBeNull();
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });

    // Note: Testing authentication retry with tokens requires jsdom environment
    // or mocking window/localStorage which is complex in node environment
  });
});