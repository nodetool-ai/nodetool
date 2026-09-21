import { parseHiggsfieldCredential } from "../providerCatalog";

describe("parseHiggsfieldCredential", () => {
  it("splits the credential copied from Higgsfield", () => {
    expect(
      parseHiggsfieldCredential(
        "00000000-0000-4000-8000-000000000000:test-secret"
      )
    ).toEqual({
      HIGGSFIELD_API_KEY_ID: "00000000-0000-4000-8000-000000000000",
      HIGGSFIELD_API_KEY_SECRET: "test-secret"
    });
  });

  it.each([
    "",
    "00000000-0000-4000-8000-000000000000",
    "not-a-uuid:secret",
    "00000000-0000-4000-8000-000000000000:"
  ])("rejects malformed credentials: %s", (value) => {
    expect(parseHiggsfieldCredential(value)).toBeNull();
  });
});
