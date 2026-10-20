import {
  openverseLicenseLabel,
  readOpenverseCredit
} from "../openverseLicense";

describe("openverseLicenseLabel", () => {
  it("names the public domain mark", () => {
    expect(openverseLicenseLabel({ license: "pdm" })).toBe("Public domain");
  });

  it("names CC0 without a CC prefix", () => {
    expect(
      openverseLicenseLabel({ license: "cc0", license_version: "1.0" })
    ).toBe("CC0 1.0");
  });

  it("upper-cases a Creative Commons license and appends the version", () => {
    expect(
      openverseLicenseLabel({ license: "by-sa", license_version: "4.0" })
    ).toBe("CC BY-SA 4.0");
  });

  it("omits the version when there is none", () => {
    expect(openverseLicenseLabel({ license: "by" })).toBe("CC BY");
  });
});

describe("readOpenverseCredit", () => {
  it.each([
    ["null metadata", null],
    ["undefined metadata", undefined],
    ["missing key", {}],
    ["a string value", { openverse: "by" }],
    ["an array value", { openverse: [] }],
    ["a null value", { openverse: null }],
    ["a non-string license", { openverse: { license: 3 } }]
  ])("returns null for %s", (_label, metadata) => {
    expect(readOpenverseCredit(metadata)).toBeNull();
  });

  it("reads string fields and drops empty or non-string ones", () => {
    expect(
      readOpenverseCredit({
        openverse: {
          license: "by",
          license_version: "2.0",
          creator: "",
          attribution: 7,
          source: "flickr"
        }
      })
    ).toEqual({
      license: "by",
      license_version: "2.0",
      license_url: undefined,
      creator: undefined,
      attribution: undefined,
      landing_url: undefined,
      source: "flickr"
    });
  });
});
