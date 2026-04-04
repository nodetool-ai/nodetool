import { customType } from "drizzle-orm/sqlite-core";

/**
 * Custom Drizzle column type that stores JSON as TEXT in SQLite.
 * Handles serialization/deserialization automatically.
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
