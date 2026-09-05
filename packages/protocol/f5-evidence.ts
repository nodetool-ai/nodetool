import type { z } from "zod";
import { assetResponse } from "./src/api-schemas/assets.js";
import { workflowResponse } from "./src/api-schemas/workflows.js";
import type { Asset, Workflow } from "./src/api-types.js";

type W = z.infer<typeof workflowResponse>;
type A = z.infer<typeof assetResponse>;

// Every key where the schema's field type is not assignable to the interface's.
type Bad<S, I> = {
  [K in Extract<keyof S, keyof I>]: S[K] extends I[K] ? never : K;
}[Extract<keyof S, keyof I>];

type OnlyInInterface<S, I> = Exclude<keyof I, keyof S>;
type OnlyInSchema<S, I> = Exclude<keyof S, keyof I>;

declare const wBad: Bad<W, Workflow>;
declare const wOnlyI: OnlyInInterface<W, Workflow>;
declare const wOnlyS: OnlyInSchema<W, Workflow>;
declare const aBad: Bad<A, Asset>;
declare const aOnlyI: OnlyInInterface<A, Asset>;
declare const aOnlyS: OnlyInSchema<A, Asset>;

const x: 1 = wBad; const y: 1 = wOnlyI; const z2: 1 = wOnlyS;
const p: 1 = aBad; const q: 1 = aOnlyI; const r: 1 = aOnlyS;
void x; void y; void z2; void p; void q; void r;
