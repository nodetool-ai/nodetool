import baseConfig from "./vitest.config";

export default {
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: ["tests/**/*.test.ts"],
    exclude: []
  }
};
