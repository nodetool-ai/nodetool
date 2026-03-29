import {
  parseCSV,
  parseDataframeFile,
  isSupportedDataframeFile,
  SUPPORTED_DATAFRAME_EXTENSIONS
} from "../dataframeParsers";

describe("dataframeParsers", () => {
  describe("SUPPORTED_DATAFRAME_EXTENSIONS", () => {
    it("should include csv, xlsx, and xls extensions", () => {
      expect(SUPPORTED_DATAFRAME_EXTENSIONS).toContain(".csv");
      expect(SUPPORTED_DATAFRAME_EXTENSIONS).toContain(".xlsx");
      expect(SUPPORTED_DATAFRAME_EXTENSIONS).toContain(".xls");
    });
  });

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

  describe("parseCSV", () => {
    it("should parse a simple CSV", () => {
      const csv = `name,age,score
John,30,85.5
Jane,25,92.3`;

      const result = parseCSV(csv);

      expect(result.type).toBe("dataframe");
      expect(result.columns).toHaveLength(3);
      expect(result.columns![0].name).toBe("name");
      expect(result.columns![0].data_type).toBe("string");
      expect(result.columns![1].name).toBe("age");
      expect(result.columns![1].data_type).toBe("int");
      expect(result.columns![2].name).toBe("score");
      expect(result.columns![2].data_type).toBe("float");
      expect(result.data).toHaveLength(2);
      expect(result.data![0]).toEqual(["John", 30, 85.5]);
      expect(result.data![1]).toEqual(["Jane", 25, 92.3]);
    });

    it("should handle quoted values with commas", () => {
      const csv = `name,address
"Smith, John","123 Main St, Apt 4"`;

      const result = parseCSV(csv);

      expect(result.columns).toHaveLength(2);
      expect(result.data![0]).toEqual(["Smith, John", "123 Main St, Apt 4"]);
    });

    it("should handle escaped quotes in quoted values", () => {
      const csv = `name,quote
John,"He said ""hello"""`;

      const result = parseCSV(csv);

      expect(result.data![0]).toEqual(["John", 'He said "hello"']);
    });

    it("should handle empty CSV", () => {
      const result = parseCSV("");

      expect(result.type).toBe("dataframe");
      expect(result.columns).toHaveLength(0);
      expect(result.data).toHaveLength(0);
    });

    it("should handle CSV with only headers", () => {
      const csv = "name,age,score";

      const result = parseCSV(csv);

      expect(result.columns).toHaveLength(3);
      expect(result.data).toHaveLength(0);
    });

    it("should infer datetime type for ISO dates", () => {
      const csv = `event,date
Meeting,2024-01-15
Conference,2024-02-20`;

      const result = parseCSV(csv);

      expect(result.columns![1].data_type).toBe("datetime");
    });

    it("should handle Windows-style line endings", () => {
      const csv = "name,age\r\nJohn,30\r\nJane,25";

      const result = parseCSV(csv);

      expect(result.data).toHaveLength(2);
      expect(result.data![0]).toEqual(["John", 30]);
    });

    it("should use Column N for empty headers", () => {
      const csv = `,value,
a,1,x`;

      const result = parseCSV(csv);

      expect(result.columns![0].name).toBe("Column 1");
      expect(result.columns![1].name).toBe("value");
      expect(result.columns![2].name).toBe("Column 3");
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
