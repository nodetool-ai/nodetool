import { describe, expect, it } from "vitest";

import {
  TYPESCRIPT_6_FALLBACK_BUILD_SCRIPT,
  TYPESCRIPT_6_FALLBACK_WATCH_SCRIPT,
  TYPESCRIPT_API_SPEC,
  TYPESCRIPT_NATIVE_SPEC,
  auditLockfile,
  auditManifests,
  auditSourceText
} from "../check-typescript-policy.mjs";

describe("TypeScript policy audit", () => {
  it("rejects a deliberately invalid compiler range and bare tsc command", () => {
    const errors = auditManifests([
      {
        path: "fixture/package.json",
        manifest: {
          scripts: { typecheck: "tsc --noEmit" },
          devDependencies: { typescript: "^5.9.0" }
        }
      }
    ]);

    expect(errors).toEqual([
      `fixture/package.json: typescript must be ${TYPESCRIPT_API_SPEC}, found ^5.9.0`,
      "fixture/package.json script typecheck: invoke scripts/run-tsc.mjs instead of bare tsc"
    ]);
  });

  it("accepts the exact dual compiler topology", () => {
    expect(
      auditManifests([
        {
          path: "fixture/package.json",
          manifest: {
            devDependencies: {
              typescript: TYPESCRIPT_API_SPEC,
              "@typescript/native": TYPESCRIPT_NATIVE_SPEC
            },
            scripts: { typecheck: "node ../scripts/run-tsc.mjs --noEmit" }
          }
        }
      ])
    ).toEqual([]);
  });

  it("requires the TypeScript 6 fallback to build packages in dependency order", () => {
    expect(
      auditManifests([
        {
          path: "package.json",
          manifest: {
            scripts: {
              "build:tsc6":
                "node scripts/run-with-tsc-version.mjs 6 npm run build:packages:tsc"
            }
          }
        }
      ])
    ).toEqual([
      "package.json script build:tsc6 must use the forced dependency-ordered package build"
    ]);

    expect(
      auditManifests([
        {
          path: "package.json",
          manifest: { scripts: { "build:tsc6": TYPESCRIPT_6_FALLBACK_BUILD_SCRIPT } }
        }
      ])
    ).toEqual([]);
  });

  it("requires the CLI compiler watch to use the TypeScript 6 fallback", () => {
    expect(
      auditManifests([
        {
          path: "packages/cli/package.json",
          manifest: { scripts: { dev: "node ../../scripts/run-tsc.mjs --watch" } }
        }
      ])
    ).toEqual([
      "packages/cli/package.json script dev must use the TypeScript 6 watch fallback"
    ]);

    expect(
      auditManifests([
        {
          path: "packages/cli/package.json",
          manifest: { scripts: { dev: TYPESCRIPT_6_FALLBACK_WATCH_SCRIPT } }
        }
      ])
    ).toEqual([]);
  });

  it("rejects native API imports and direct compiler paths", () => {
    expect(auditSourceText("fixture.ts", "import ts from '@typescript/native';")).toHaveLength(1);
    expect(auditSourceText("fixture.mjs", "const path = 'typescript/bin/tsc';")).toHaveLength(1);
  });

  it("requires native platform package entries in lockfiles", () => {
    const errors = auditLockfile(
      "fixture-lock.json",
      {
        packages: {
          "": {
            devDependencies: {
              typescript: TYPESCRIPT_API_SPEC,
              "@typescript/native": TYPESCRIPT_NATIVE_SPEC
            }
          },
          "node_modules/@typescript/native": {
            version: "7.0.2",
            optionalDependencies: { "@typescript/typescript-linux-x64": "7.0.2" }
          },
          "node_modules/typescript": { name: "@typescript/typescript6", version: "6.0.2" }
        }
      },
      { apiRequired: true }
    );

    expect(errors).toEqual([
      "fixture-lock.json: missing exact native platform package @typescript/typescript-linux-x64@7.0.2"
    ]);
  });
});
