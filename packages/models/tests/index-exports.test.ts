import { describe, it, expect } from "vitest";
import * as models from "../src/index.js";

describe("models index exports", () => {
  it("exports ConditionBuilder utilities", () => {
    expect(models.Operator).toBeDefined();
    expect(models.LogicalOperator).toBeDefined();
    expect(models.Variable).toBeDefined();
    expect(models.Condition).toBeDefined();
    expect(models.ConditionGroup).toBeDefined();
    expect(models.Field).toBeDefined();
    expect(models.ConditionBuilder).toBeDefined();
    expect(models.field).toBeDefined();
  });

  it("exports MemoryAdapter", () => {
    expect(models.MemoryAdapter).toBeDefined();
    expect(models.MemoryAdapterFactory).toBeDefined();
  });

  it("exports SQLiteAdapter", () => {
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

  it("exports domain models", () => {
    expect(models.Job).toBeDefined();
    expect(models.Workflow).toBeDefined();
    expect(models.Asset).toBeDefined();
    expect(models.Message).toBeDefined();
    expect(models.Thread).toBeDefined();
    expect(models.Secret).toBeDefined();
    expect(models.OAuthCredential).toBeDefined();
  });
});
