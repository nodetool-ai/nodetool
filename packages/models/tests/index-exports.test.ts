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
    expect(models.predictions).toBeDefined();
    expect(models.runEvents).toBeDefined();
  });

  it("exports base model utilities", () => {
    expect(models.DBModel).toBeDefined();
    expect(models.ModelObserver).toBeDefined();
    expect(models.ModelChangeEvent).toBeDefined();
    expect(models.createTimeOrderedUuid).toBeDefined();
    expect(models.computeEtag).toBeDefined();
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
    expect(models.RunEvent).toBeDefined();
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
