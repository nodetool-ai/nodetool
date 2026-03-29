import { describe, it, expect } from "vitest";
import * as models from "../src/index.js";

describe("models index exports", () => {
  it("exports database connection utilities", () => {
    expect(models.initDb).toBeDefined();
    expect(models.initTestDb).toBeDefined();
    expect(models.getDb).toBeDefined();
    expect(models.getRawDb).toBeDefined();
    expect(models.closeDb).toBeDefined();
  });

  it("exports Drizzle schema tables", () => {
    expect(models.workflows).toBeDefined();
    expect(models.jobs).toBeDefined();
    expect(models.messages).toBeDefined();
    expect(models.threads).toBeDefined();
    expect(models.assets).toBeDefined();
    expect(models.secrets).toBeDefined();
    expect(models.workspaces).toBeDefined();
    expect(models.workflowVersions).toBeDefined();
    expect(models.oauthCredentials).toBeDefined();
    expect(models.runNodeState).toBeDefined();
    expect(models.predictions).toBeDefined();
    expect(models.runEvents).toBeDefined();
    expect(models.runLeases).toBeDefined();
  });

  it("exports ConditionBuilder utilities (legacy compat)", () => {
    expect(models.Operator).toBeDefined();
    expect(models.LogicalOperator).toBeDefined();
    expect(models.Variable).toBeDefined();
    expect(models.Condition).toBeDefined();
    expect(models.ConditionGroup).toBeDefined();
    expect(models.Field).toBeDefined();
    expect(models.ConditionBuilder).toBeDefined();
    expect(models.field).toBeDefined();
  });

  it("exports adapter utilities (legacy compat)", () => {
    expect(models.MemoryAdapter).toBeDefined();
    expect(models.MemoryAdapterFactory).toBeDefined();
    expect(models.SQLiteAdapter).toBeDefined();
    expect(models.SQLiteAdapterFactory).toBeDefined();
  });

  it("exports base model utilities", () => {
    expect(models.DBModel).toBeDefined();
    expect(models.ModelObserver).toBeDefined();
    expect(models.ModelChangeEvent).toBeDefined();
    expect(models.createTimeOrderedUuid).toBeDefined();
    expect(models.computeEtag).toBeDefined();
    expect(models.setGlobalAdapterResolver).toBeDefined();
    expect(models.getGlobalAdapterResolver).toBeDefined();
  });

  it("round-trips the legacy adapter resolver shim", () => {
    const resolver = (schema: unknown) => schema;
    models.setGlobalAdapterResolver(resolver);
    expect(models.getGlobalAdapterResolver()).toBe(resolver);
  });

  it("exports domain models", () => {
    expect(models.Job).toBeDefined();
    expect(models.Workflow).toBeDefined();
    expect(models.WorkflowVersion).toBeDefined();
    expect(models.Asset).toBeDefined();
    expect(models.Message).toBeDefined();
    expect(models.Thread).toBeDefined();
    expect(models.Secret).toBeDefined();
    expect(models.OAuthCredential).toBeDefined();
    expect(models.Prediction).toBeDefined();
    expect(models.Workspace).toBeDefined();
    expect(models.RunNodeState).toBeDefined();
    expect(models.RunEvent).toBeDefined();
    expect(models.RunLease).toBeDefined();
  });

  it("exports api-graph utilities", () => {
    expect(models.toApiNode).toBeDefined();
    expect(models.toApiEdge).toBeDefined();
    expect(models.toApiGraph).toBeDefined();
    expect(models.removeConnectedSlots).toBeDefined();
  });

  it("exports migration utilities", () => {
    expect(models.MigrationError).toBeDefined();
    expect(models.LockError).toBeDefined();
    expect(models.ChecksumError).toBeDefined();
    expect(models.BaselineError).toBeDefined();
    expect(models.MigrationDiscoveryError).toBeDefined();
    expect(models.RollbackError).toBeDefined();
    expect(models.DatabaseState).toBeDefined();
    expect(models.APPLICATION_TABLES).toBeDefined();
    expect(models.MIGRATION_TRACKING_TABLE).toBeDefined();
    expect(models.MIGRATION_LOCK_TABLE).toBeDefined();
    expect(models.detectDatabaseState).toBeDefined();
    expect(models.SQLiteMigrationAdapter).toBeDefined();
    expect(models.PostgresMigrationAdapter).toBeDefined();
    expect(models.migrations).toBeDefined();
    expect(models.MigrationRunner).toBeDefined();
  });
});
