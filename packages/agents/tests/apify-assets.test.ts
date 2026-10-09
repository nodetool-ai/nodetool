import { describe, expect, it } from "vitest";

import { isBinaryContentType } from "../src/apify/assets.js";

describe("isBinaryContentType", () => {
  it.each([
    "application/pdf",
    "application/octet-stream",
    "application/zip",
    "image/png",
    "image/svg+xml",
    "video/mp4",
    "audio/mpeg",
    ""
  ])("imports %j", (type) => {
    expect(isBinaryContentType(type)).toBe(true);
  });

  it.each([
    "text/plain",
    "TEXT/HTML; charset=utf-8",
    "text/xml",
    " application/json ",
    "application/JSON;charset=utf-8",
    "application/xml",
    "application/javascript",
    "application/ld+json",
    "application/problem+json",
    "application/vnd.api+json",
    "application/geo+json",
    "application/x-ndjson",
    "application/atom+xml",
    "application/xhtml+xml"
  ])("leaves %j in the result", (type) => {
    expect(isBinaryContentType(type)).toBe(false);
  });
});
