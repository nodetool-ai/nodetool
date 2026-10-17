import {
  toggleBold,
  toggleBulletList,
  toggleHeading
} from "../markdownFormatting";

describe("markdownFormatting", () => {
  it("makes a line a heading and toggles it back", () => {
    expect(toggleHeading(["Heater broken"])).toEqual(["# Heater broken"]);
    expect(toggleHeading(["# Heater broken"])).toEqual(["Heater broken"]);
  });

  it("replaces a deeper heading marker with a top-level one", () => {
    expect(toggleHeading(["### Notes"])).toEqual(["# Notes"]);
  });

  it("prefixes an empty line so the next typing is a heading", () => {
    expect(toggleHeading([""])).toEqual(["# "]);
  });

  it("turns lines into a bulleted list and leaves blank lines alone", () => {
    expect(toggleBulletList(["one", "", "2. two"])).toEqual([
      "- one",
      "",
      "- two"
    ]);
    expect(toggleBulletList(["- one", "- two"])).toEqual(["one", "two"]);
  });

  it("wraps and unwraps bold text", () => {
    expect(toggleBold("urgent")).toBe("**urgent**");
    expect(toggleBold("**urgent**")).toBe("urgent");
    expect(toggleBold("")).toBe("****");
  });
});
