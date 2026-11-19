import { isSameOrigin, LOCAL_ORIGIN, originQueryKey, type DocumentOrigin } from "../documentOrigin";

const ADA: DocumentOrigin = { kind: "cloud", server: "https://api.nodetool.ai", account: "u1" };
const BOB: DocumentOrigin = { kind: "cloud", server: "https://api.nodetool.ai", account: "u2" };

describe("document origins", () => {
  it("TC124: a local and a cloud document with the same id never share a key", () => {
    const key = ["workflow", "w1"] as const;
    expect(originQueryKey(LOCAL_ORIGIN, key)).toEqual(["workflow", "w1"]);
    expect(originQueryKey(ADA, key)).toEqual(["cloud", "https://api.nodetool.ai", "u1", "workflow", "w1"]);
    expect(originQueryKey(ADA, key)).not.toEqual(originQueryKey(BOB, key));
  });

  it("compares server and account", () => {
    expect(isSameOrigin(ADA, { ...ADA })).toBe(true);
    expect(isSameOrigin(ADA, BOB)).toBe(false);
    expect(isSameOrigin(ADA, LOCAL_ORIGIN)).toBe(false);
    expect(isSameOrigin(LOCAL_ORIGIN, { kind: "local" })).toBe(true);
  });
});
