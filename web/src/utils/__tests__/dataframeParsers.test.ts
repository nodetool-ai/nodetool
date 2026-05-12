import {
  parseDataframeFile,
  isSupportedDataframeFile
} from "../dataframeParsers";

describe("dataframeParsers", () => {
  describe("isSupportedDataframeFile", () => {
    it("should return true for CSV files", () => {
      const file = new File([""], "test.csv", { type: "text/csv" });
      expect(isSupportedDataframeFile(file)).toBe(true);
    });

    it("should return true for XLSX files", () => {
      const file = new File([""], "test.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      });
      expect(isSupportedDataframeFile(file)).toBe(true);
    });

    it("should return true for XLS files", () => {
      const file = new File([""], "test.xls", {
        type: "application/vnd.ms-excel"
      });
      expect(isSupportedDataframeFile(file)).toBe(true);
    });

    it("should return false for unsupported file types", () => {
      const file = new File([""], "test.txt", { type: "text/plain" });
      expect(isSupportedDataframeFile(file)).toBe(false);
    });

    it("should be case-insensitive", () => {
      const file = new File([""], "TEST.CSV", { type: "text/csv" });
      expect(isSupportedDataframeFile(file)).toBe(true);
    });
  });

  describe("parseDataframeFile", () => {
    it("should parse CSV file", async () => {
      const csvContent = `name,age
John,30
Jane,25`;
      const file = new File([csvContent], "test.csv", { type: "text/csv" });
      // Mock the text() method for jsdom environment
      file.text = jest.fn().mockResolvedValue(csvContent);

      const result = await parseDataframeFile(file);

      expect(result.type).toBe("dataframe");
      expect(result.columns).toHaveLength(2);
      expect(result.data).toHaveLength(2);
    });

    it("should throw error for unsupported file types", async () => {
      const file = new File(["test content"], "test.txt", {
        type: "text/plain"
      });

      await expect(parseDataframeFile(file)).rejects.toThrow(
        "Unsupported file type"
      );
    });
  });
});
