import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";

import { appendAuditEntry, readAuditLog } from "../src/tenant-audit.js";

function makeTmpFile(): string {
  return path.join(
    os.tmpdir(),
    `nodetool-audit-${crypto.randomUUID()}`,
    "audit.jsonl"
  );
}

describe("tenant-audit", () => {
  let logPath: string;

  beforeEach(() => {
    logPath = makeTmpFile();
  });

  afterEach(async () => {
    await fs.rm(path.dirname(logPath), { recursive: true, force: true });
  });

  it("returns empty array when log does not exist", async () => {
    expect(await readAuditLog(logPath)).toEqual([]);
  });

  it("creates parent dir and appends one entry", async () => {
    const entry = await appendAuditEntry(logPath, {
      tenant_id: "acme",
      action: "deployment.apply",
      deployment: "prod",
      status: "ok"
    });
    expect(entry.tenant_id).toBe("acme");
    expect(entry.actor).toBe("acme");
    expect(entry.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const read = await readAuditLog(logPath);
    expect(read).toHaveLength(1);
    expect(read[0].action).toBe("deployment.apply");
  });

  it("appends across multiple writes preserving order", async () => {
    await appendAuditEntry(logPath, {
      tenant_id: "acme",
      action: "deployment.create",
      status: "ok"
    });
    await appendAuditEntry(logPath, {
      tenant_id: "acme",
      action: "deployment.apply",
      deployment: "prod",
      status: "error",
      error: "boom"
    });

    const read = await readAuditLog(logPath);
    expect(read).toHaveLength(2);
    expect(read[0].action).toBe("deployment.create");
    expect(read[1].status).toBe("error");
    expect(read[1].error).toBe("boom");
  });

  it("survives malformed lines", async () => {
    await appendAuditEntry(logPath, {
      tenant_id: "acme",
      action: "deployment.create",
      status: "ok"
    });
    // Inject a bad line.
    await fs.appendFile(logPath, "not json at all\n");
    await appendAuditEntry(logPath, {
      tenant_id: "acme",
      action: "deployment.apply",
      status: "ok"
    });

    const skipped: string[] = [];
    const read = await readAuditLog(logPath, (line) => skipped.push(line));
    expect(read).toHaveLength(2);
    expect(skipped).toEqual(["not json at all"]);
  });

  it("uses tenant_id as default actor", async () => {
    const entry = await appendAuditEntry(logPath, {
      tenant_id: "acme",
      action: "x",
      status: "ok"
    });
    expect(entry.actor).toBe("acme");
  });

  it("respects explicit actor override", async () => {
    const entry = await appendAuditEntry(logPath, {
      tenant_id: "acme",
      actor: "admin@example.com",
      action: "x",
      status: "ok"
    });
    expect(entry.actor).toBe("admin@example.com");
  });
});
