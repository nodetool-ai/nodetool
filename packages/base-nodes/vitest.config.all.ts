import baseConfig from "./vitest.config";

export default {
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: ["tests/**/*.test.ts", "src/**/__tests__/**/*.test.ts"],
    exclude: []
  }
};
