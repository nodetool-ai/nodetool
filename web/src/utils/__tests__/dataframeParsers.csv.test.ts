import { parseDataframeFile } from "../dataframeParsers";

function csvFile(content: string, name = "test.csv"): File {
  const f = new File([content], name, { type: "text/csv" });
  f.text = jest.fn().mockResolvedValue(content);
  return f;
}

describe("parseDataframeFile — CSV type inference", () => {
  it("infers integer columns", async () => {
    const csv = "count\n1\n2\n3";
    const result = await parseDataframeFile(csvFile(csv));
    expect(result.columns![0].data_type).toBe("int");
    expect(result.data!).toEqual([[1], [2], [3]]);
  });

  it("infers float columns when values contain decimals", async () => {
    const csv = "price\n1.5\n2.99\n0.1";
    const result = await parseDataframeFile(csvFile(csv));
    expect(result.columns![0].data_type).toBe("float");
    expect(result.data![0][0]).toBeCloseTo(1.5);
    expect(result.data![1][0]).toBeCloseTo(2.99);
  });

  it("promotes mixed int/float column to float", async () => {
    const csv = "value\n1\n2.5\n3";
    const result = await parseDataframeFile(csvFile(csv));
    expect(result.columns![0].data_type).toBe("float");
  });

  it("infers datetime columns from ISO dates", async () => {
    const csv = "date\n2024-01-15\n2024-02-20\n2024-03-25";
    const result = await parseDataframeFile(csvFile(csv));
    expect(result.columns![0].data_type).toBe("datetime");
    expect(result.data![0][0]).toContain("2024-01-15");
  });

  it("keeps string columns as string", async () => {
    const csv = "name\nalice\nbob\ncharlie";
    const result = await parseDataframeFile(csvFile(csv));
    expect(result.columns![0].data_type).toBe("string");
    expect(result.data!).toEqual([["alice"], ["bob"], ["charlie"]]);
  });

  it("handles multiple columns with different types", async () => {
    const csv = "name,age,score\nalice,30,95.5\nbob,25,87.3";
    const result = await parseDataframeFile(csvFile(csv));
    expect(result.columns!).toHaveLength(3);
    expect(result.columns![0].data_type).toBe("string");
    expect(result.columns![1].data_type).toBe("int");
    expect(result.columns![2].data_type).toBe("float");
  });
});

describe("parseDataframeFile — CSV quoting", () => {
  it("handles quoted fields containing commas", async () => {
    const csv = 'name,desc\nalice,"hello, world"';
    const result = await parseDataframeFile(csvFile(csv));
    expect(result.data![0][1]).toBe("hello, world");
  });

  it("handles escaped quotes within quoted fields", async () => {
    const csv = 'name,note\nalice,"she said ""hi"""';
    const result = await parseDataframeFile(csvFile(csv));
    expect(result.data![0][1]).toBe('she said "hi"');
  });

  it("handles empty quoted fields", async () => {
    const csv = 'a,b\n"",value';
    const result = await parseDataframeFile(csvFile(csv));
    expect(result.data![0][0]).toBeNull();
    expect(result.data![0][1]).toBe("value");
  });
});

describe("parseDataframeFile — edge cases", () => {
  it("returns empty dataframe for empty CSV", async () => {
    const result = await parseDataframeFile(csvFile(""));
    expect(result.columns!).toEqual([]);
    expect(result.data!).toEqual([]);
  });

  it("returns columns but no data for header-only CSV", async () => {
    const result = await parseDataframeFile(csvFile("name,age"));
    expect(result.columns!).toHaveLength(2);
    expect(result.data!).toEqual([]);
  });

  it("converts null/empty values to null", async () => {
    const csv = "a,b\n1,\n,2";
    const result = await parseDataframeFile(csvFile(csv));
    expect(result.data![0][1]).toBeNull();
    expect(result.data![1][0]).toBeNull();
  });

  it("generates default column names for unnamed headers", async () => {
    const csv = ",\nval1,val2";
    const result = await parseDataframeFile(csvFile(csv));
    expect(result.columns![0].name).toBe("Column 1");
    expect(result.columns![1].name).toBe("Column 2");
  });

  it("handles Windows-style line endings", async () => {
    const csv = "x\r\n1\r\n2";
    const result = await parseDataframeFile(csvFile(csv));
    expect(result.data!).toHaveLength(2);
  });
});
