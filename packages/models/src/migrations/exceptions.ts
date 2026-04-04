/**
 * Exception classes for the migration system.
 *
 * Port of Python's `nodetool.migrations.exceptions`.
 */

export class MigrationError extends Error {
  migrationVersion: string | null;

  constructor(message: string, migrationVersion: string | null = null) {
    super(message);
    this.name = "MigrationError";
    this.migrationVersion = migrationVersion;
  }
}

export class LockError extends MigrationError {
  constructor(message: string, migrationVersion: string | null = null) {
    super(message, migrationVersion);
    this.name = "LockError";
  }
}

export class ChecksumError extends MigrationError {
  expectedChecksum: string;
  actualChecksum: string;

  constructor(
    message: string,
    migrationVersion: string,
    expectedChecksum: string,
    actualChecksum: string
  ) {
    super(message, migrationVersion);
    this.name = "ChecksumError";
    this.expectedChecksum = expectedChecksum;
    this.actualChecksum = actualChecksum;
  }
}

export class BaselineError extends MigrationError {
  constructor(message: string, migrationVersion: string | null = null) {
    super(message, migrationVersion);
    this.name = "BaselineError";
  }
}

export class MigrationDiscoveryError extends MigrationError {
  constructor(message: string, migrationVersion: string | null = null) {
    super(message, migrationVersion);
    this.name = "MigrationDiscoveryError";
  }
}

export class RollbackError extends MigrationError {
  constructor(message: string, migrationVersion: string | null = null) {
    super(message, migrationVersion);
    this.name = "RollbackError";
  }
}
