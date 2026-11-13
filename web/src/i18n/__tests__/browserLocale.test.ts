import { browserLocale } from "../locales";

describe("browserLocale", () => {
  it("matches an exact supported locale", () => {
    expect(browserLocale(["zh-CN"])).toBe("zh-CN");
  });

  it("falls back to the base language", () => {
    expect(browserLocale(["fr-CA"])).toBe("fr");
    expect(browserLocale(["de-AT", "en"])).toBe("de");
  });

  it("maps Chinese and Norwegian variants to the shipped catalog", () => {
    expect(browserLocale(["zh-TW"])).toBe("zh-CN");
    expect(browserLocale(["no"])).toBe("nb");
  });

  it("skips unsupported languages and defaults to English", () => {
    expect(browserLocale(["tr-TR", "es-MX"])).toBe("es");
    expect(browserLocale(["tr-TR"])).toBe("en");
    expect(browserLocale([])).toBe("en");
  });
});
