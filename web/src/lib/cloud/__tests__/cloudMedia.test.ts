import { cloudAssetUrl, cloudMediaUrl } from "../cloudMedia";

const ORIGIN = "https://api.nodetool.ai";

describe("cloud media URLs", () => {
  it("maps the server's file routes to the nodetool-cloud: scheme", () => {
    expect(cloudMediaUrl(ORIGIN, "/api/assets/a1/peaks")).toBe("nodetool-cloud://api.nodetool.ai/api/assets/a1/peaks");
    expect(cloudMediaUrl(ORIGIN, "/api/storage/u1/a1.png?v=2")).toBe(
      "nodetool-cloud://api.nodetool.ai/api/storage/u1/a1.png?v=2"
    );
    expect(cloudMediaUrl(ORIGIN, "/trpc/assets.get")).toBeNull();
    expect(cloudMediaUrl(ORIGIN, "/api/storage/")).toBeNull();
    expect(cloudMediaUrl("http://api.nodetool.ai", "/api/assets/a1")).toBeNull();
  });

  it("keeps a signed URL elsewhere and routes the server's own URLs through the scheme", () => {
    expect(cloudAssetUrl("https://bucket.s3.amazonaws.com/u1/a1.png?X-Amz-Signature=x", ORIGIN)).toBe(
      "https://bucket.s3.amazonaws.com/u1/a1.png?X-Amz-Signature=x"
    );
    expect(cloudAssetUrl("/api/storage/u1/a1.png", ORIGIN)).toBe("nodetool-cloud://api.nodetool.ai/api/storage/u1/a1.png");
    expect(cloudAssetUrl(`${ORIGIN}/api/storage/u1/a1.png`, ORIGIN)).toBe(
      "nodetool-cloud://api.nodetool.ai/api/storage/u1/a1.png"
    );
    expect(cloudAssetUrl("//evil.example/a.png", ORIGIN)).toBeNull();
    expect(cloudAssetUrl("http://cdn.example/a.png", ORIGIN)).toBeNull();
    expect(cloudAssetUrl("javascript:alert(1)", ORIGIN)).toBeNull();
    expect(cloudAssetUrl(null, ORIGIN)).toBeNull();
  });
});
