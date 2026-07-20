import {
  normalizeUpdateChannel,
  getUpdateChannel,
} from "../settings";

describe("normalizeUpdateChannel", () => {
  it('returns "latest" for "latest"', () => {
    expect(normalizeUpdateChannel("latest")).toBe("latest");
  });

  it('returns "nightly" for "nightly"', () => {
    expect(normalizeUpdateChannel("nightly")).toBe("nightly");
  });

  it("returns null for unrecognized strings", () => {
    expect(normalizeUpdateChannel("beta")).toBeNull();
    expect(normalizeUpdateChannel("")).toBeNull();
  });

  it("returns null for non-string values", () => {
    expect(normalizeUpdateChannel(42)).toBeNull();
    expect(normalizeUpdateChannel(null)).toBeNull();
    expect(normalizeUpdateChannel(undefined)).toBeNull();
    expect(normalizeUpdateChannel(true)).toBeNull();
  });
});

describe("getUpdateChannel", () => {
  it("returns stored channel when configured by user", () => {
    const settings = {
      updateChannel: "nightly",
      updateChannelConfiguredByUser: true,
    };
    expect(getUpdateChannel(settings, "1.0.0")).toBe("nightly");
  });

  it("ignores stored channel when not configured by user", () => {
    const settings = {
      updateChannel: "nightly",
      updateChannelConfiguredByUser: false,
    };
    expect(getUpdateChannel(settings, "1.0.0")).toBe("latest");
  });

  it('defaults to "nightly" for nightly versions', () => {
    expect(getUpdateChannel({}, "1.0.0-nightly.20250101.1")).toBe("nightly");
  });

  it('defaults to "latest" for stable versions', () => {
    expect(getUpdateChannel({}, "1.0.0")).toBe("latest");
    expect(getUpdateChannel({}, "2.3.4")).toBe("latest");
  });

  it("ignores invalid stored channel even when configured by user", () => {
    const settings = {
      updateChannel: "beta",
      updateChannelConfiguredByUser: true,
    };
    expect(getUpdateChannel(settings, "1.0.0")).toBe("latest");
  });

  it("user-configured latest overrides nightly version default", () => {
    const settings = {
      updateChannel: "latest",
      updateChannelConfiguredByUser: true,
    };
    expect(getUpdateChannel(settings, "1.0.0-nightly.20250526.1")).toBe("latest");
  });
});

