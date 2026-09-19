import { describe, expect, it } from "vitest";

import { resolveMigrationDatabaseUrl } from "../db-migrate-url.mjs";

describe("resolveMigrationDatabaseUrl", () => {
  it("prefers the dedicated migration connection", () => {
    expect(
      resolveMigrationDatabaseUrl({
        DIRECT_URL: " postgres://direct ",
        DATABASE_URL: "postgres://pooled"
      })
    ).toBe("postgres://direct");
  });

  it("falls back to the application connection for local and legacy deployments", () => {
    expect(resolveMigrationDatabaseUrl({ DATABASE_URL: " postgres://pooled " })).toBe(
      "postgres://pooled"
    );
  });

  it("returns undefined when no PostgreSQL connection is configured", () => {
    expect(resolveMigrationDatabaseUrl({})).toBeUndefined();
  });
});
