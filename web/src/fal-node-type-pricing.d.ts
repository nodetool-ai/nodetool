/** FAL by-node-type pricing bundle from codegen (`fal-node-type-pricing.json`). */
declare module "@nodetool/fal-node-type-pricing" {
  const bundle: {
    schemaVersion: number;
    writtenAt: string;
    byNodeType: Record<
      string,
      import("./stores/ApiTypes").FalUnitPricing
    >;
  };
  export default bundle;
}
