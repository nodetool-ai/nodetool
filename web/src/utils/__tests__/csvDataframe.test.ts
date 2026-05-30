import {
  csvDelimiterFor,
  dataframeToCsv,
  parseCsvToDataframe
} from "../csvDataframe";

describe("csvDelimiterFor", () => {
  it("uses tabs for .tsv and commas otherwise", () => {
    expect(csvDelimiterFor("rows.tsv")).toBe("\t");
    expect(csvDelimiterFor("data.csv")).toBe(",");
    expect(csvDelimiterFor("DATA.CSV")).toBe(",");
  });
});

describe("parseCsvToDataframe", () => {
  it("uses the first row as column names", () => {
    const df = parseCsvToDataframe("a,b\n1,2\n3,4", ",");
    expect(df.type).toBe("dataframe");
    expect(df.columns?.map((c) => c.name)).toEqual(["a", "b"]);
    expect(df.data).toEqual([
      ["1", "2"],
      ["3", "4"]
    ]);
  });
});

describe("CSV round-trip", () => {
  it("preserves header and rows", () => {
    const csv = "name,age\r\nAda,36\r\nLin,28";
    const df = parseCsvToDataframe(csv, ",");
    const out = dataframeToCsv(df, ",");
    expect(parseCsvToDataframe(out, ",").data).toEqual([
      ["Ada", "36"],
      ["Lin", "28"]
    ]);
    expect(out.split(/\r\n|\n/)[0]).toBe("name,age");
  });
});
