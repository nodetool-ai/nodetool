import { describe, expect, it } from "vitest";
import {
  CUSTOM_PROVIDER_PREFIX,
  customProviderApiKeyKey,
  customProviderBaseUrlError,
  customProviderBaseUrlKey,
  customProviderId,
  customProviderSlugError,
  isCustomProviderId,
  normalizeBaseUrl,
  parseCustomProviderCatalog,
  slugifyProviderName
} from "../src/custom-providers.js";

describe("custom provider ids", () => {
  it("prefixes the slug and recognizes the result", () => {
    const id = customProviderId("myproxy");
    expect(id).toBe(`${CUSTOM_PROVIDER_PREFIX}myproxy`);
    expect(isCustomProviderId(id)).toBe(true);
  });

  it("does not claim a built-in provider id", () => {
    expect(isCustomProviderId("openai")).toBe(false);
  });

  it("names both secrets off the slug", () => {
    expect(customProviderBaseUrlKey("myproxy")).toBe("CUSTOM_MYPROXY_BASE_URL");
    expect(customProviderApiKeyKey("myproxy")).toBe("CUSTOM_MYPROXY_API_KEY");
  });
});

describe("slugifyProviderName", () => {
  it("collapses punctuation and spaces to underscores", () => {
    expect(slugifyProviderName("My Proxy!")).toBe("my_proxy");
    expect(slugifyProviderName("  Acme — Gateway  ")).toBe("acme_gateway");
  });

  it("prefixes a leading digit so the result stays an identifier", () => {
    expect(slugifyProviderName("42 llms")).toBe("p42_llms");
  });

  it("returns empty when nothing usable survives", () => {
    expect(slugifyProviderName("!!!")).toBe("");
  });
});

describe("customProviderSlugError", () => {
  it("accepts a plain identifier", () => {
    expect(customProviderSlugError("my_proxy2")).toBeNull();
  });

  it("rejects an empty, leading-digit, or punctuated slug", () => {
    expect(customProviderSlugError("")).toContain("required");
    expect(customProviderSlugError("2fast")).not.toBeNull();
    expect(customProviderSlugError("my-proxy")).not.toBeNull();
    expect(customProviderSlugError("MyProxy")).not.toBeNull();
    expect(customProviderSlugError("a".repeat(33))).not.toBeNull();
  });
});

describe("customProviderBaseUrlError", () => {
  it("accepts http and https URLs", () => {
    expect(customProviderBaseUrlError("https://proxy.example.com/v1")).toBeNull();
    expect(customProviderBaseUrlError("http://localhost:8080/v1")).toBeNull();
  });

  it("rejects empty, unparseable, and non-http schemes", () => {
    expect(customProviderBaseUrlError("  ")).toContain("required");
    expect(customProviderBaseUrlError("proxy.example.com")).not.toBeNull();
    expect(customProviderBaseUrlError("ftp://proxy.example.com")).not.toBeNull();
  });
});

describe("normalizeBaseUrl", () => {
  it("trims whitespace and trailing slashes", () => {
    expect(normalizeBaseUrl("  https://p.example.com/v1//  ")).toBe(
      "https://p.example.com/v1"
    );
  });
});

describe("parseCustomProviderCatalog", () => {
  it("reads a well-formed catalog", () => {
    const raw = JSON.stringify([
      { slug: "myproxy", name: "My Proxy", models: ["a", "b"] }
    ]);
    expect(parseCustomProviderCatalog(raw)).toEqual([
      { slug: "myproxy", name: "My Proxy", models: ["a", "b"] }
    ]);
  });

  it("falls back to the slug when the name is missing", () => {
    expect(parseCustomProviderCatalog(JSON.stringify([{ slug: "myproxy" }]))).toEqual([
      { slug: "myproxy", name: "myproxy", models: [] }
    ]);
  });

  it("drops entries whose slug would not make a valid provider id", () => {
    const raw = JSON.stringify([
      { slug: "2fast", name: "Bad" },
      { slug: "", name: "Empty" },
      { name: "No slug" },
      "not an object",
      null,
      { slug: "good", name: "Good" }
    ]);
    expect(parseCustomProviderCatalog(raw).map((d) => d.slug)).toEqual(["good"]);
  });

  it("drops non-string model ids", () => {
    const raw = JSON.stringify([
      { slug: "myproxy", name: "My Proxy", models: ["ok", 7, null] }
    ]);
    expect(parseCustomProviderCatalog(raw)[0]?.models).toEqual(["ok"]);
  });

  it("returns an empty catalog for unusable JSON", () => {
    expect(parseCustomProviderCatalog("{not json")).toEqual([]);
    expect(parseCustomProviderCatalog('{"slug":"x"}')).toEqual([]);
  });
});
