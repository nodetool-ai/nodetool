/**
 * Provider-seam fault modules (docs/RELIABILITY_ARCHITECTURE.md §9; task D1).
 *
 * Each of the seven `provider-*` fault names in `cli.ts`'s `KNOWN_FAULT_TYPES`
 * maps to one `ProviderFault` kind the fault-capable `CassetteProvider`
 * (`@nodetool-ai/runtime`) understands. `configure()` registers a
 * `FaultCassetteProvider` under a fixed provider id
 * ({@link RELIABILITY_FAULT_PROVIDER_ID}) into the process-wide provider
 * registry (`@nodetool-ai/runtime`'s `registerProvider` — shared by the
 * kernel driver's in-process session and the ws-server driver's in-process
 * test server alike, since both run in this same Node process), and the
 * teardown restores whatever was registered there before (or unregisters it
 * if nothing was).
 *
 * A journey exercises this fault by giving an LLM node's `model.provider`
 * the value {@link RELIABILITY_FAULT_PROVIDER_ID} (see
 * `reliability/journeys/provider-failure-mid-stream/workflow.json`).
 */
import {
  CassetteProvider,
  FakeProvider,
  getRegisteredProvider,
  registerProvider,
  unregisterProvider,
  type BaseProvider,
  type ProviderFault,
  type ProviderFaultKind
} from "@nodetool-ai/runtime";
import { registerFaultModule } from "./registry.js";
import type { FaultContext, FaultModule, FaultTeardown } from "./types.js";

/** Provider id journeys wire an LLM node's `model.provider` to in order to
 * exercise a provider fault (kernel + ws-server share this process-wide
 * registration). Overridable per-fault via `fault.params.providerId`. */
export const RELIABILITY_FAULT_PROVIDER_ID = "reliability-fault-llm";

/** `cli.ts`'s `KNOWN_FAULT_TYPES` `provider-*` entries, mapped to the
 * `ProviderFault.kind` the cassette provider understands. */
const FAULT_KIND_BY_NAME: Readonly<Record<string, ProviderFaultKind>> = {
  "provider-429": "http-429",
  "provider-500": "http-500",
  "provider-timeout": "timeout",
  "provider-truncated-stream": "truncated-stream",
  "provider-malformed-sse": "malformed-chunk",
  "provider-slow-drip": "slow-drip",
  "provider-cost-omission": "cost-omission"
};

const FAULT_FIXTURE_TEXT =
  "This is a deterministic reliability-harness fixture response used to " +
  "exercise provider fault injection end to end.";

/** A `new (kwargs) => BaseProvider` shape (`registerProvider`'s contract) that
 * wraps a fresh `FakeProvider` in a fault-scripted `CassetteProvider`. Kwargs
 * carry the `ProviderFault` a given `getProvider()` call should apply — set
 * per-registration by `configureProviderFault`, not per-instance by a caller. */
class FaultCassetteProvider extends CassetteProvider {
  constructor(kwargs: { fault?: ProviderFault } = {}) {
    super(
      new FakeProvider({
        textResponse: FAULT_FIXTURE_TEXT,
        shouldStream: true,
        chunkSize: 6
      }) as unknown as BaseProvider,
      { mode: "auto", fault: kwargs.fault }
    );
  }
}

function faultParams(fault: FaultContext["fault"]): Record<string, unknown> {
  return fault.params ?? {};
}

function providerIdFor(fault: FaultContext["fault"]): string {
  const configured = faultParams(fault)["providerId"];
  return typeof configured === "string" && configured.length > 0
    ? configured
    : RELIABILITY_FAULT_PROVIDER_ID;
}

/** Builds the `ProviderFault` a fault module's `configure()` registers, from
 * the fixed `kind` plus whatever numeric knobs the journey/`--faults` call
 * supplied in `fault.params` (`afterChunks`, `delayMs`, `timeoutMs`,
 * `retryAfterSeconds` — see `ProviderFault` in `cassette-provider.ts`). */
function buildProviderFault(
  kind: ProviderFaultKind,
  fault: FaultContext["fault"]
): ProviderFault {
  const params = faultParams(fault);
  const numeric = (key: string): number | undefined => {
    const value = params[key];
    return typeof value === "number" ? value : undefined;
  };
  return {
    kind,
    afterChunks: numeric("afterChunks"),
    delayMs: numeric("delayMs"),
    timeoutMs: numeric("timeoutMs"),
    retryAfterSeconds: numeric("retryAfterSeconds")
  };
}

function configureProviderFault(
  kind: ProviderFaultKind,
  ctx: FaultContext
): FaultTeardown {
  const providerId = providerIdFor(ctx.fault);
  const previous = getRegisteredProvider(providerId);
  registerProvider(providerId, FaultCassetteProvider, {
    fault: buildProviderFault(kind, ctx.fault)
  });
  return () => {
    if (previous) {
      registerProvider(
        providerId,
        previous.cls,
        previous.kwargs,
        previous.optionalKwargs
      );
    } else {
      unregisterProvider(providerId);
    }
  };
}

function makeProviderFaultModule(
  name: string,
  kind: ProviderFaultKind
): FaultModule {
  return {
    name,
    seam: "provider",
    configure: (ctx) => configureProviderFault(kind, ctx)
  };
}

export const PROVIDER_FAULT_MODULES: readonly FaultModule[] = Object.entries(
  FAULT_KIND_BY_NAME
).map(([name, kind]) => makeProviderFaultModule(name, kind));

/** Registers every provider-seam fault module. Called once from
 * `faults/index.ts`'s module-load side effect (mirrors `registerBaseNodes`'
 * "call once, own module state" shape) — safe to call again (registration is
 * last-write-wins, same as `NodeRegistry.register`). */
export function registerProviderFaultModules(): void {
  for (const module of PROVIDER_FAULT_MODULES) {
    registerFaultModule(module);
  }
}
