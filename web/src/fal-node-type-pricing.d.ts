import type { FalUnitPricing } from "./stores/ApiTypes";

declare module "@nodetool/fal-node-type-pricing" {
  const bundle: {
    schemaVersion: number;
    writtenAt: string;
    byNodeType: Record<string, FalUnitPricing>;
  };
  export default bundle;
}
