import { formatRunningTime } from "./timeFormat";

describe("formatRunningTime", () => {
  it("formats zero seconds", () => {
    expect(formatRunningTime(0)).toEqual({ text: "0:00", sizeKey: "smaller" });
  });

  it("formats seconds under a minute", () => {
    expect(formatRunningTime(45)).toEqual({
      text: "0:45",
      sizeKey: "smaller"
    });
  });

  it("formats exactly one minute", () => {
    expect(formatRunningTime(60)).toEqual({
      text: "1:00",
      sizeKey: "smaller"
    });
  });

  it("formats minutes under 10 with smaller sizeKey", () => {
    expect(formatRunningTime(125)).toEqual({
      text: "2:05",
      sizeKey: "smaller"
    });
  });

  it("formats 10+ minutes with tiny sizeKey", () => {
    expect(formatRunningTime(600)).toEqual({
      text: "10:00",
      sizeKey: "tiny"
    });
  });

  it("formats minutes and seconds at 10-minute boundary", () => {
    expect(formatRunningTime(632)).toEqual({
      text: "10:32",
      sizeKey: "tiny"
    });
  });

  it("formats hours with tinyer sizeKey", () => {
    expect(formatRunningTime(3661)).toEqual({
      text: "1:01:01",
      sizeKey: "tinyer"
    });
  });

  it("zero-pads minutes and seconds in hour format", () => {
    expect(formatRunningTime(3600)).toEqual({
      text: "1:00:00",
      sizeKey: "tinyer"
    });
  });

  it("formats large hour values", () => {
    expect(formatRunningTime(86400)).toEqual({
      text: "24:00:00",
      sizeKey: "tinyer"
    });
  });
});
