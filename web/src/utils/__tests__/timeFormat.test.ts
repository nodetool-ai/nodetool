import { formatRunningTime } from "../timeFormat";

describe("formatRunningTime", () => {
  it("formats seconds under 1 minute correctly", () => {
    const result = formatRunningTime(45);
    expect(result).toEqual({
      text: "0:45",
      sizeKey: "smaller"
    });
  });

  it("formats seconds at exactly 1 minute correctly", () => {
    const result = formatRunningTime(60);
    expect(result).toEqual({
      text: "1:00",
      sizeKey: "smaller"
    });
  });

  it("formats seconds under 10 minutes correctly", () => {
    const result = formatRunningTime(325); // 5:25
    expect(result).toEqual({
      text: "5:25",
      sizeKey: "smaller"
    });
  });

  it("formats seconds at exactly 10 minutes correctly", () => {
    const result = formatRunningTime(600);
    expect(result).toEqual({
      text: "10:00",
      sizeKey: "tiny"
    });
  });

  it("formats seconds over 10 minutes correctly", () => {
    const result = formatRunningTime(1845); // 30:45
    expect(result).toEqual({
      text: "30:45",
      sizeKey: "tiny"
    });
  });

  it("formats seconds at exactly 1 hour correctly", () => {
    const result = formatRunningTime(3600);
    expect(result).toEqual({
      text: "1:00:00",
      sizeKey: "tinyer"
    });
  });

  it("formats seconds over 1 hour correctly", () => {
    const result = formatRunningTime(5432); // 1:30:32
    expect(result).toEqual({
      text: "1:30:32",
      sizeKey: "tinyer"
    });
  });

  it("formats multiple hours correctly", () => {
    const result = formatRunningTime(10825); // 3:00:25
    expect(result).toEqual({
      text: "3:00:25",
      sizeKey: "tinyer"
    });
  });

  it("pads single digit minutes and seconds with leading zeros for hours format", () => {
    const result = formatRunningTime(3665); // 1:01:05
    expect(result).toEqual({
      text: "1:01:05",
      sizeKey: "tinyer"
    });
  });

  it("pads single digit seconds with leading zeros for minutes format", () => {
    const result = formatRunningTime(65); // 1:05
    expect(result).toEqual({
      text: "1:05",
      sizeKey: "smaller"
    });
  });

  it("handles zero seconds", () => {
    const result = formatRunningTime(0);
    expect(result).toEqual({
      text: "0:00",
      sizeKey: "smaller"
    });
  });
});
