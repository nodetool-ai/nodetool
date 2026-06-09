/**
 * Tests for how the AWS Secrets Manager client is *configured* (region) and
 * *queried* (SecretId), as opposed to master-key-aws.test.ts which covers the
 * resolution policy (fatal-on-error, binary decoding, etc.).
 *
 * We capture the constructor arguments the production code passes to the AWS
 * SDK so a regression in region selection or secret addressing is caught — both
 * are silent failures in a real deployment (wrong region → secret not found,
 * dropped SecretId → wrong/empty secret).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const aws = vi.hoisted(() => ({
  clientArgs: [] as unknown[],
  commandArgs: [] as unknown[],
  secretString: "aws-key"
}));

vi.mock("@aws-sdk/client-secrets-manager", () => ({
  SecretsManagerClient: class {
    constructor(config: unknown) {
      aws.clientArgs.push(config);
    }
    send = async () => ({ SecretString: aws.secretString });
  },
  GetSecretValueCommand: class {
    constructor(input: unknown) {
      aws.commandArgs.push(input);
    }
  }
}));

import {
  initMasterKey,
  clearMasterKeyCache,
  resetKeytarLoader
} from "../src/master-key.js";

describe("AWS Secrets Manager client configuration", () => {
  const savedRegion = process.env["AWS_REGION"];

  beforeEach(() => {
    clearMasterKeyCache();
    resetKeytarLoader();
    aws.clientArgs.length = 0;
    aws.commandArgs.length = 0;
    aws.secretString = "aws-key";
    delete process.env["SECRETS_MASTER_KEY"];
    process.env["AWS_SECRETS_MASTER_KEY_NAME"] = "nodetool/master-key";
    delete process.env["AWS_REGION"];
  });

  afterEach(() => {
    clearMasterKeyCache();
    resetKeytarLoader();
    delete process.env["AWS_SECRETS_MASTER_KEY_NAME"];
    if (savedRegion === undefined) {
      delete process.env["AWS_REGION"];
    } else {
      process.env["AWS_REGION"] = savedRegion;
    }
  });

  it("defaults to the us-east-1 region when AWS_REGION is unset", async () => {
    await initMasterKey();

    expect(aws.clientArgs).toEqual([{ region: "us-east-1" }]);
  });

  it("honours the AWS_REGION environment variable when set", async () => {
    process.env["AWS_REGION"] = "eu-west-1";

    await initMasterKey();

    expect(aws.clientArgs).toEqual([{ region: "eu-west-1" }]);
  });

  it("requests exactly the configured secret name as SecretId", async () => {
    process.env["AWS_SECRETS_MASTER_KEY_NAME"] = "prod/master-key";

    await initMasterKey();

    expect(aws.commandArgs).toEqual([{ SecretId: "prod/master-key" }]);
  });
});
