import { isSupportedDataframeFile, parseDataframeFile } from "./dataframeParsers";

function makeFile(name: string, content: string): File {
  const blob = new Blob([content], { type: "text/csv" });
  const file = new File([blob], name, { type: "text/csv" });
  if (typeof file.text !== "function") {
    file.text = () => Promise.resolve(content);
  }
  return file;
}

describe("isSupportedDataframeFile", () => {
  it("accepts .csv files", () => {
    expect(isSupportedDataframeFile(makeFile("data.csv", ""))).toBe(true);
  });

  it("accepts .xlsx files", () => {
    expect(isSupportedDataframeFile(makeFile("data.xlsx", ""))).toBe(true);
  });

  it("accepts .xls files", () => {
    expect(isSupportedDataframeFile(makeFile("data.xls", ""))).toBe(true);
  });

  it("rejects unsupported extensions", () => {
    expect(isSupportedDataframeFile(makeFile("data.json", ""))).toBe(false);
    expect(isSupportedDataframeFile(makeFile("data.txt", ""))).toBe(false);
    expect(isSupportedDataframeFile(makeFile("data.parquet", ""))).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isSupportedDataframeFile(makeFile("DATA.CSV", ""))).toBe(true);
    expect(isSupportedDataframeFile(makeFile("Sheet.XLSX", ""))).toBe(true);
  });
});

describe("parseDataframeFile (CSV)", () => {
  it("parses a simple CSV with headers and data", async () => {
    const csv = "name,age,score\nAlice,30,95.5\nBob,25,88.0";
    const result = await parseDataframeFile(makeFile("test.csv", csv));

    expect(result.type).toBe("dataframe");
    expect(result.columns).toHaveLength(3);
    expect(result.columns![0].name).toBe("name");
    expect(result.columns![1].name).toBe("age");
    expect(result.columns![2].name).toBe("score");
    expect(result.data).toHaveLength(2);
  });

  it("infers integer column types", async () => {
    const csv = "id,count\n1,100\n2,200\n3,300";
    const result = await parseDataframeFile(makeFile("test.csv", csv));

    expect(result.columns![0].data_type).toBe("int");
    expect(result.columns![1].data_type).toBe("int");
    expect(result.data![0][0]).toBe(1);
  });

  it("infers float column types", async () => {
    const csv = "value\n1.5\n2.7\n3.14";
    const result = await parseDataframeFile(makeFile("test.csv", csv));

    expect(result.columns![0].data_type).toBe("float");
    expect(result.data![0][0]).toBe(1.5);
  });

  it("infers string column types", async () => {
    const csv = "label\nhello\nworld";
    const result = await parseDataframeFile(makeFile("test.csv", csv));

    expect(result.columns![0].data_type).toBe("string");
    expect(result.data![0][0]).toBe("hello");
  });

  it("handles empty CSV", async () => {
    const result = await parseDataframeFile(makeFile("empty.csv", ""));

    expect(result.columns).toHaveLength(0);
    expect(result.data).toHaveLength(0);
  });

  it("handles CSV with only headers", async () => {
    const csv = "col1,col2,col3";
    const result = await parseDataframeFile(makeFile("test.csv", csv));

    expect(result.columns).toHaveLength(3);
    expect(result.data).toHaveLength(0);
  });

  it("handles quoted values with commas", async () => {
    const csv = 'name,description\nAlice,"Hello, World"\nBob,"Testing, 1, 2, 3"';
    const result = await parseDataframeFile(makeFile("test.csv", csv));

    expect(result.data![0][1]).toBe("Hello, World");
    expect(result.data![1][1]).toBe("Testing, 1, 2, 3");
  });

  it("handles escaped quotes in CSV", async () => {
    const csv = 'text\n"She said ""hello"""\n"Normal"';
    const result = await parseDataframeFile(makeFile("test.csv", csv));

    expect(result.data![0][0]).toBe('She said "hello"');
  });

  it("handles null/empty values", async () => {
    const csv = "a,b\n1,\n,2";
    const result = await parseDataframeFile(makeFile("test.csv", csv));

    expect(result.data).toHaveLength(2);
  });

  it("uses float type when column has mixed int and float", async () => {
    const csv = "value\n1\n2.5\n3";
    const result = await parseDataframeFile(makeFile("test.csv", csv));

    expect(result.columns![0].data_type).toBe("float");
  });

  it("infers datetime column type", async () => {
    const csv = "timestamp\n2024-01-15\n2024-02-20\n2024-03-25";
    const result = await parseDataframeFile(makeFile("test.csv", csv));

    expect(result.columns![0].data_type).toBe("datetime");
  });

  it("handles Windows-style line endings", async () => {
    const csv = "a,b\r\n1,2\r\n3,4";
    const result = await parseDataframeFile(makeFile("test.csv", csv));

    expect(result.data).toHaveLength(2);
  });

  it("throws for unsupported file types", async () => {
    await expect(
      parseDataframeFile(makeFile("data.json", "{}"))
    ).rejects.toThrow("Unsupported file type");
  });
});
