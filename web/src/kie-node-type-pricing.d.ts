/** KIE by-node-type pricing bundle from codegen (`kie-node-type-pricing.json`). */
declare module "@nodetool/kie-node-type-pricing" {
  const bundle: {
    schemaVersion: number;
    writtenAt: string;
    byNodeType: Record<string, import("./stores/ApiTypes").KieUnitPricing>;
  };
  export default bundle;
}
