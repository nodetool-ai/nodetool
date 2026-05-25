/** Full FAL pricing catalog snapshot from codegen (`fal-unit-pricing.json`). */
declare module "@nodetool/fal-unit-pricing-catalog" {
  const catalog: {
    schemaVersion: number;
    writtenAt: string;
    prices?: Record<string, unknown>;
  };
  export default catalog;
}
