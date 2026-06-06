/** Full KIE pricing catalog snapshot from codegen (`kie-unit-pricing.json`). */
declare module "@nodetool/kie-unit-pricing-catalog" {
  const catalog: {
    schemaVersion: number;
    writtenAt: string;
    prices: Record<
      string,
      import("./stores/ApiTypes").KieUnitPricing & { model_id: string }
    >;
  };
  export default catalog;
}
