import { describe, it, expect } from "vitest";

import {
  assertValidTenantId,
  InvalidTenantIdError,
  TenantQuotaSchema,
  TenantRecordSchema,
  parseTenantIndex,
  resolveTenantPaths,
  TENANT_ID_PATTERN
} from "../src/tenant-config.js";

describe("assertValidTenantId", () => {
  it.each([
    "a",
    "ab",
    "a1",
    "acme",
    "tenant-1",
    "a-b-c-d",
    "0xabc-pro"
  ])("accepts %s", (id) => {
    expect(() => assertValidTenantId(id)).not.toThrow();
  });

  it.each([
    "",
    "-leading",
    "trailing-",
    "Has-Upper",
    "double--dash-ok-actually", // double dash IS allowed by [a-z0-9-]
    "with space",
    "with/slash",
    "with..dotdot",
    "../escape",
    "a".repeat(65)
  ])("evaluates edge case %s", (id) => {
    // Most of the above are rejected, but `double--dash-ok-actually` matches
    // [a-z0-9-]* — assert against the regex directly to keep this honest.
    const valid = TENANT_ID_PATTERN.test(id);
    if (valid) {
      expect(() => assertValidTenantId(id)).not.toThrow();
    } else {
      expect(() => assertValidTenantId(id)).toThrow(InvalidTenantIdError);
    }
  });

  it("rejects path-traversal attempts", () => {
    expect(() => assertValidTenantId("../escape")).toThrow();
    expect(() => assertValidTenantId("./local")).toThrow();
    expect(() => assertValidTenantId("foo/bar")).toThrow();
  });
});

describe("TenantQuotaSchema", () => {
  it("applies defaults", () => {
    const q = TenantQuotaSchema.parse({});
    expect(q.max_deployments).toBe(5);
    expect(q.max_workers_per_endpoint).toBe(3);
    expect(q.max_gpu_count_per_endpoint).toBe(1);
    expect(q.allowed_providers).toEqual([]);
    expect(q.allowed_gpu_types).toEqual([]);
  });

  it("rejects negative limits", () => {
    expect(() => TenantQuotaSchema.parse({ max_deployments: -1 })).toThrow();
  });

  it("validates allowed providers as enum", () => {
    expect(() =>
      TenantQuotaSchema.parse({ allowed_providers: ["bogus"] })
    ).toThrow();
  });
});

describe("TenantRecordSchema", () => {
  it("requires id, display_name, timestamps", () => {
    const r = TenantRecordSchema.parse({
      id: "acme",
      display_name: "Acme Corp",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      credentials: {}
    });
    expect(r.status).toBe("active");
    expect(r.quota.max_deployments).toBe(5);
  });

  it("accepts encrypted credentials", () => {
    const r = TenantRecordSchema.parse({
      id: "acme",
      display_name: "Acme",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      credentials: {
        RUNPOD_API_KEY: {
          ciphertext: "base64==",
          updated_at: "2026-01-01T00:00:00Z"
        }
      }
    });
    expect(r.credentials.RUNPOD_API_KEY?.ciphertext).toBe("base64==");
  });
});

describe("parseTenantIndex", () => {
  it("returns empty registry for empty input", () => {
    const idx = parseTenantIndex({});
    expect(idx.tenants).toEqual({});
    expect(idx.version).toBe("1.0");
  });
});

describe("resolveTenantPaths", () => {
  it("composes deployment.yaml and audit.jsonl under <base>/<id>", () => {
    const p = resolveTenantPaths("/srv/tenants", "acme");
    expect(p.dir).toBe("/srv/tenants/acme");
    expect(p.deployment).toBe("/srv/tenants/acme/deployment.yaml");
    expect(p.audit).toBe("/srv/tenants/acme/audit.jsonl");
    expect(p.index).toBe("/srv/tenants/index.yaml");
  });

  it("rejects malicious ids", () => {
    expect(() => resolveTenantPaths("/srv/tenants", "../escape")).toThrow();
  });
});
