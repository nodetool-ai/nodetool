import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema",
  out: "./src/drizzle-migrations",
  dialect: "sqlite"
});
