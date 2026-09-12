/**
 * The `libc` guard behind `npm run check:lockfile-libc`. A regression here is
 * silent and expensive: npm only filters musl builds it can see a `libc` on, so
 * a stripped field puts ~490 MB of unloadable musl binaries back into every
 * `npm ci` (CI, the Docker image, fresh clones) without failing anything.
 */
import { describe, expect, it } from "vitest";

import { candidates, checkOffline, packageName, withLibc } from "../patch-lockfile-libc.mjs";

const muslEntry = (overrides = {}) => ({
  version: "1.0.0",
  resolved: "https://registry.npmjs.org/x/-/x-1.0.0.tgz",
  cpu: ["x64"],
  libc: ["musl"],
  optional: true,
  os: ["linux"],
  ...overrides
});

const lock = (entries) => candidates(entries);

describe("packageName", () => {
  it("reads the name after the last node_modules segment", () => {
    expect(packageName("node_modules/@rspack/binding-linux-x64-musl")).toBe(
      "@rspack/binding-linux-x64-musl"
    );
  });

  it("unwraps workspace-nested and doubly nested paths", () => {
    expect(packageName("web/node_modules/lightningcss-linux-x64-musl")).toBe(
      "lightningcss-linux-x64-musl"
    );
    expect(packageName("node_modules/a/node_modules/b-linux-x64-musl")).toBe("b-linux-x64-musl");
  });

  it("returns null for a workspace link key with no node_modules segment", () => {
    expect(packageName("packages/runtime")).toBeNull();
  });
});

describe("candidates", () => {
  it("selects Linux entries and skips other platforms, links and the root", () => {
    const selected = lock({
      "": { name: "root" },
      "node_modules/a-linux-x64-musl": muslEntry(),
      "node_modules/b-darwin-arm64": muslEntry({ os: ["darwin"] }),
      "node_modules/c-win32-x64": muslEntry({ os: ["win32"] }),
      "packages/runtime": { link: true, resolved: "packages/runtime" },
      "node_modules/d-no-os": { version: "1.0.0", resolved: "https://r/d.tgz" }
    }).map(({ name }) => name);
    expect(selected).toEqual(["a-linux-x64-musl"]);
  });
});

describe("withLibc", () => {
  it("writes libc directly after cpu, where npm writes it", () => {
    const entry = { version: "1.0.0", integrity: "sha512-x", cpu: ["x64"], os: ["linux"] };
    expect(Object.keys(withLibc(entry, ["musl"]))).toEqual([
      "version",
      "integrity",
      "cpu",
      "libc",
      "os"
    ]);
  });

  it("falls back to integrity when the entry declares no cpu", () => {
    const entry = { version: "1.0.0", integrity: "sha512-x", os: ["linux"] };
    expect(Object.keys(withLibc(entry, ["glibc"]))).toEqual([
      "version",
      "integrity",
      "libc",
      "os"
    ]);
  });

  it("preserves the original values", () => {
    const entry = { version: "1.0.0", cpu: ["x64"], os: ["linux"] };
    expect(withLibc(entry, ["musl"])).toMatchObject({ version: "1.0.0", libc: ["musl"] });
  });
});

describe("checkOffline", () => {
  it("passes when every installable musl build records libc", () => {
    expect(checkOffline(lock({ "node_modules/a-linux-x64-musl": muslEntry() }))).toBe(0);
  });

  it("fails when an x64 musl build lost its libc", () => {
    const stripped = muslEntry();
    delete stripped.libc;
    expect(checkOffline(lock({ "node_modules/a-linux-x64-musl": stripped }))).toBe(1);
  });

  it("fails when libc records the wrong ABI", () => {
    const wrong = muslEntry({ libc: ["glibc"] });
    expect(checkOffline(lock({ "node_modules/a-linux-x64-musl": wrong }))).toBe(1);
  });

  it("ignores musl builds for architectures we never install on", () => {
    // @oxlint, @oxc-parser and @oxc-resolver publish linux-arm-musleabihf
    // without any libc field; cpu alone already excludes them.
    const armMusl = muslEntry({ cpu: ["arm"] });
    delete armMusl.libc;
    const entries = {
      "node_modules/a-linux-arm-musleabihf": armMusl,
      "node_modules/b-linux-x64-musl": muslEntry()
    };
    expect(checkOffline(lock(entries))).toBe(0);
  });

  it("covers arm64, which CI and contributor machines also use", () => {
    const stripped = muslEntry({ cpu: ["arm64"] });
    delete stripped.libc;
    expect(checkOffline(lock({ "node_modules/a-linux-arm64-musl": stripped }))).toBe(1);
  });

  it("fails rather than reporting success when it inspected nothing", () => {
    expect(checkOffline(lock({ "node_modules/a-linux-x64-gnu": muslEntry({ libc: ["glibc"] }) }))).toBe(1);
  });
});
