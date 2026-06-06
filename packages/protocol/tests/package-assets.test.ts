import { describe, expect, it } from "vitest";
import {
  PACKAGE_ASSET_HTTP_PREFIX,
  PACKAGE_ASSET_SCHEME,
  buildPackageAssetUri,
  isPackageAssetUri,
  packageAssetHttpPath,
  parsePackageAssetUri
} from "../src/package-assets.js";

describe("package-assets", () => {
  describe("isPackageAssetUri", () => {
    it("recognizes package URIs", () => {
      expect(isPackageAssetUri("package://nodetool-base/sample.png")).toBe(true);
    });
    it("rejects other schemes and empties", () => {
      expect(isPackageAssetUri("asset://abc")).toBe(false);
      expect(isPackageAssetUri("/api/storage/x.png")).toBe(false);
      expect(isPackageAssetUri("")).toBe(false);
      expect(isPackageAssetUri(null)).toBe(false);
      expect(isPackageAssetUri(undefined)).toBe(false);
    });
  });

  describe("parsePackageAssetUri", () => {
    it("splits package and path", () => {
      expect(parsePackageAssetUri("package://nodetool-base/audio/loop.mp3")).toEqual(
        { packageName: "nodetool-base", path: "audio/loop.mp3" }
      );
    });
    it("strips leading slashes from the path", () => {
      expect(parsePackageAssetUri("package://pkg//nested/file.bin")).toEqual({
        packageName: "pkg",
        path: "nested/file.bin"
      });
    });
    it("returns null when malformed", () => {
      expect(parsePackageAssetUri("package://only-package")).toBeNull();
      expect(parsePackageAssetUri("package:///no-package")).toBeNull();
      expect(parsePackageAssetUri("package://pkg/")).toBeNull();
      expect(parsePackageAssetUri("asset://abc")).toBeNull();
    });
  });

  describe("buildPackageAssetUri", () => {
    it("round-trips with parse", () => {
      const uri = buildPackageAssetUri("nodetool-base", "img/cat.png");
      expect(uri).toBe(`${PACKAGE_ASSET_SCHEME}nodetool-base/img/cat.png`);
      expect(parsePackageAssetUri(uri)).toEqual({
        packageName: "nodetool-base",
        path: "img/cat.png"
      });
    });
    it("normalizes backslashes and leading slashes", () => {
      expect(buildPackageAssetUri("pkg", "/a\\b\\c.png")).toBe(
        "package://pkg/a/b/c.png"
      );
    });
  });

  describe("packageAssetHttpPath", () => {
    it("maps to the served HTTP path with encoding", () => {
      expect(packageAssetHttpPath("package://nodetool-base/a b/c.png")).toBe(
        `${PACKAGE_ASSET_HTTP_PREFIX}nodetool-base/a%20b/c.png`
      );
    });
    it("returns null for non-package URIs", () => {
      expect(packageAssetHttpPath("asset://abc")).toBeNull();
    });
  });
});
