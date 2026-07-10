/**
 * SigV4 signing vectors.
 *
 * V1–V5 are the official examples from the AWS docs ("Authenticating
 * Requests: AWS Signature Version 4" — examplebucket, us-east-1, fixed
 * timestamp 20130524T000000Z, credentials AKIAIOSFODNN7EXAMPLE). V6 exercises
 * a key with spaces, unicode, `+` and the RFC 3986 specials plus a query
 * needing sorting; its signature was cross-checked against
 * @smithy/signature-v4 before the SDK was removed.
 */
import { describe, it, expect } from "vitest";
import {
  canonicalQueryString,
  encodeRfc3986,
  encodeS3Path,
  presignUrl,
  sha256Hex,
  signRequest,
  EMPTY_PAYLOAD_SHA256
} from "../src/s3/signer.js";

const credentials = {
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
};
const date = new Date("2013-05-24T00:00:00Z");

describe("SigV4 signing (AWS docs vectors)", () => {
  it("V1: GET object with Range header", () => {
    const result = signRequest({
      method: "GET",
      path: "/test.txt",
      host: "examplebucket.s3.amazonaws.com",
      headers: { range: "bytes=0-9" },
      payloadHash: EMPTY_PAYLOAD_SHA256,
      region: "us-east-1",
      credentials,
      date
    });

    expect(result.canonicalRequest).toBe(
      [
        "GET",
        "/test.txt",
        "",
        "host:examplebucket.s3.amazonaws.com",
        "range:bytes=0-9",
        `x-amz-content-sha256:${EMPTY_PAYLOAD_SHA256}`,
        "x-amz-date:20130524T000000Z",
        "",
        "host;range;x-amz-content-sha256;x-amz-date",
        EMPTY_PAYLOAD_SHA256
      ].join("\n")
    );
    expect(result.stringToSign).toBe(
      [
        "AWS4-HMAC-SHA256",
        "20130524T000000Z",
        "20130524/us-east-1/s3/aws4_request",
        "7344ae5b7ee6c3e7e6b0fe0640412a37625d1fbfff95c48bbb2dc43964946972"
      ].join("\n")
    );
    expect(result.headers.authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41"
    );
  });

  it("V2: GET bucket lifecycle (empty query value)", () => {
    const result = signRequest({
      method: "GET",
      path: "/",
      query: { lifecycle: "" },
      host: "examplebucket.s3.amazonaws.com",
      payloadHash: EMPTY_PAYLOAD_SHA256,
      region: "us-east-1",
      credentials,
      date
    });
    expect(result.signature).toBe(
      "fea454ca298b7da1c68078a5d1bdbfbbe0d65c699e0f91ac7a200a0136783543"
    );
  });

  it("V3: list objects with query params needing sorting", () => {
    const result = signRequest({
      method: "GET",
      path: "/",
      // Given out of order; canonicalization must sort them.
      query: { prefix: "J", "max-keys": "2" },
      host: "examplebucket.s3.amazonaws.com",
      payloadHash: EMPTY_PAYLOAD_SHA256,
      region: "us-east-1",
      credentials,
      date
    });
    expect(result.canonicalRequest).toContain("\nmax-keys=2&prefix=J\n");
    expect(result.signature).toBe(
      "34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7"
    );
  });

  it("V4: PUT object with body hash and extra signed headers", () => {
    const body = Buffer.from("Welcome to Amazon S3.");
    const result = signRequest({
      method: "PUT",
      path: encodeS3Path("/test$file.text"),
      host: "examplebucket.s3.amazonaws.com",
      headers: {
        date: "Fri, 24 May 2013 00:00:00 GMT",
        "x-amz-storage-class": "REDUCED_REDUNDANCY"
      },
      payloadHash: sha256Hex(body),
      region: "us-east-1",
      credentials,
      date
    });
    expect(result.signature).toBe(
      "98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd"
    );
  });

  it("V5: presigned GET URL honoring expiry", () => {
    const url = presignUrl({
      protocol: "https:",
      host: "examplebucket.s3.amazonaws.com",
      path: "/test.txt",
      region: "us-east-1",
      credentials,
      expiresIn: 86400,
      date
    });
    expect(url).toBe(
      "https://examplebucket.s3.amazonaws.com/test.txt" +
        "?X-Amz-Algorithm=AWS4-HMAC-SHA256" +
        "&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request" +
        "&X-Amz-Date=20130524T000000Z" +
        "&X-Amz-Expires=86400" +
        "&X-Amz-SignedHeaders=host" +
        "&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404"
    );
  });

  it("V6: key with spaces, unicode, + and RFC 3986 specials", () => {
    const path = `/${encodeS3Path("folder one/über+file !'()*.txt")}`;
    expect(path).toBe(
      "/folder%20one/%C3%BCber%2Bfile%20%21%27%28%29%2A.txt"
    );
    const result = signRequest({
      method: "GET",
      path,
      query: {
        "response-content-type": "text/plain",
        "b-param": "2",
        "a-param": "with space"
      },
      host: "bucket.s3.eu-west-1.amazonaws.com",
      payloadHash: EMPTY_PAYLOAD_SHA256,
      region: "eu-west-1",
      credentials,
      date
    });
    expect(result.canonicalRequest).toBe(
      [
        "GET",
        "/folder%20one/%C3%BCber%2Bfile%20%21%27%28%29%2A.txt",
        "a-param=with%20space&b-param=2&response-content-type=text%2Fplain",
        "host:bucket.s3.eu-west-1.amazonaws.com",
        `x-amz-content-sha256:${EMPTY_PAYLOAD_SHA256}`,
        "x-amz-date:20130524T000000Z",
        "",
        "host;x-amz-content-sha256;x-amz-date",
        EMPTY_PAYLOAD_SHA256
      ].join("\n")
    );
    // Cross-checked against @smithy/signature-v4 for the identical request.
    expect(result.signature).toBe(
      "e48627466eb5af665284aaa2406e92d00bb40a4625a5b630f1ef0fe888d1bb49"
    );
  });

  it("includes the session token as a signed header when present", () => {
    const result = signRequest({
      method: "GET",
      path: "/k",
      host: "b.s3.us-east-1.amazonaws.com",
      payloadHash: EMPTY_PAYLOAD_SHA256,
      region: "us-east-1",
      credentials: { ...credentials, sessionToken: "the-token" },
      date
    });
    expect(result.headers["x-amz-security-token"]).toBe("the-token");
    expect(result.canonicalRequest).toContain(
      "host;x-amz-content-sha256;x-amz-date;x-amz-security-token"
    );
  });
});

describe("encoding helpers", () => {
  it("encodeRfc3986 escapes the characters encodeURIComponent leaves bare", () => {
    expect(encodeRfc3986("a!b'c(d)e*f")).toBe("a%21b%27c%28d%29e%2Af");
    expect(encodeRfc3986("safe-chars_.~AZaz09")).toBe("safe-chars_.~AZaz09");
  });

  it("encodeS3Path encodes segments but never the / separators", () => {
    expect(encodeS3Path("a b/c+d/e.txt")).toBe("a%20b/c%2Bd/e.txt");
  });

  it("canonicalQueryString sorts by key then value", () => {
    expect(
      canonicalQueryString([
        ["b", "2"],
        ["a", "z"],
        ["a", "a"]
      ])
    ).toBe("a=a&a=z&b=2");
  });
});
