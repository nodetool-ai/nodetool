import {
  isSearchProviderConfigured,
  SEARCH_PROVIDER_CONFIGS,
  SUGGESTED_SERP_PROVIDER
} from "../searchProviders";

const getter = (values: Record<string, string>) => (envVar: string) =>
  values[envVar];

describe("isSearchProviderConfigured", () => {
  it("is false when nothing is set (defaults to serpapi, no key)", () => {
    expect(isSearchProviderConfigured(getter({}))).toBe(false);
  });

  it("uses the default provider's credentials when SERP_PROVIDER is unset", () => {
    expect(
      isSearchProviderConfigured(getter({ SERPAPI_API_KEY: "****" }))
    ).toBe(true);
  });

  it("checks the selected provider's credentials", () => {
    expect(
      isSearchProviderConfigured(
        getter({ SERP_PROVIDER: "brave", BRAVE_API_KEY: "****" })
      )
    ).toBe(true);
  });

  it("is false when the selected provider's key is missing", () => {
    expect(
      isSearchProviderConfigured(
        getter({ SERP_PROVIDER: "brave", SERPAPI_API_KEY: "****" })
      )
    ).toBe(false);
  });

  it("treats blank/whitespace values as unconfigured", () => {
    expect(
      isSearchProviderConfigured(
        getter({ SERP_PROVIDER: "brave", BRAVE_API_KEY: "   " })
      )
    ).toBe(false);
  });

  it("requires every credential field for multi-field providers", () => {
    expect(
      isSearchProviderConfigured(
        getter({ SERP_PROVIDER: "dataforseo", DATA_FOR_SEO_LOGIN: "user" })
      )
    ).toBe(false);
    expect(
      isSearchProviderConfigured(
        getter({
          SERP_PROVIDER: "dataforseo",
          DATA_FOR_SEO_LOGIN: "user",
          DATA_FOR_SEO_PASSWORD: "pw"
        })
      )
    ).toBe(true);
  });
});

describe("search provider config", () => {
  it("suggests a free provider by default", () => {
    expect(SEARCH_PROVIDER_CONFIGS[SUGGESTED_SERP_PROVIDER].free).toBe(true);
  });
});
