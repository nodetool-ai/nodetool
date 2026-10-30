import { defineConfig } from "vitest/config";
export default defineConfig({test:{testTimeout:30000,include:["tests/**/*.test.ts","src/**/__tests__/**/*.test.ts"],passWithNoTests:true}});
