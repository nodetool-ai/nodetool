import { customType } from "drizzle-orm/pg-core";

/** Boolean values stored as integers to match SQLite's boolean columns. */
export const integerBoolean = customType<{ data: boolean; driverData: number }>({
  dataType() {
    return "integer";
  },
  toDriver(value: boolean): number {
    return value ? 1 : 0;
  },
  fromDriver(value: number): boolean {
    return value !== 0;
  }
});

/**
 * Custom Drizzle column type that stores JSON as TEXT in PostgreSQL.
 * Uses TEXT (not JSONB) to match the SQLite schema exactly, so cross-dialect
 * data migration is straightforward.
 */
export const jsonText = <T>() =>
  customType<{ data: T; driverData: string }>({
    dataType() {
      return "text";
    },
    toDriver(value: T): string {
      return JSON.stringify(value);
    },
    fromDriver(value: string): T {
      return JSON.parse(value) as T;
    }
  });
