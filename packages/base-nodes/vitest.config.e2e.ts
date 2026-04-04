import baseConfig from "./vitest.config";

export default {
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: ["tests/e2e/**/*.test.ts"],
    exclude: []
  }
};
