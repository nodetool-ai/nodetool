import { customType } from "drizzle-orm/pg-core";

/**
 * Custom Drizzle column type that stores JSON as TEXT in PostgreSQL.
 * Uses TEXT (not JSONB) to match the SQLite schema exactly, making cross-dialect
 * data migration straightforward. Handles serialization/deserialization automatically.
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
