/**
 * Provider-decorator inertness.
 *
 * A decorator that wraps a `BaseProvider` must not change what the wrapped
 * provider *does*. The failure this exists to catch is silent: a decorator
 * overrides `generateMessage`/`generateMessages` and forgets `generateLoop`,
 * so a provider that drives its own agent loop — `OpenAIProvider` (Responses
 * API) and `ClaudeAgentProvider` (the SDK's loop) — silently reverts to
 * `BaseProvider`'s generic loop the moment it is wrapped.
 *
 * That happened. A `--cassette` record/replay flag added for eval runs wrapped
 * the provider in `CassetteProvider`, and the same eval case then FAILED
 * wrapped and PASSED unwrapped. The numbers underneath a whole optimization
 * baseline were instrumentation artifacts, and nothing failed to say so — the
 * runs completed, the report rendered, the delta looked real.
 *
 * Two checks, because they catch different halves:
 *
 * - **Structural** — walk the prototype chain and ask which class owns
 *   `generateLoop`. Deterministic, needs no run, and names the exact defect:
 *   the inner overrides it and the decorator resolves back to `BaseProvider`.
 * - **Behavioural** — drive a scripted provider whose loop is distinguishable
 *   from the base loop, wrapped and unwrapped, and compare. Stronger, since it
 *   catches a decorator that *declares* `generateLoop` and forwards it wrongly.
 *
 * What this does NOT catch is stated in the assertions below rather than left
 * to be discovered: it covers `generateLoop` specifically, and a behavioural
 * difference the scripted provider does not exercise is invisible to it.
 */

import { describe, it, expect } from "vitest";
import { BaseProvider } from "../../src/providers/base-provider.js";
import { CassetteProvider } from "../../src/providers/cassette-provider.js";
import { OpenAIProvider } from "../../src/providers/openai-provider.js";
import type { ProviderStreamItem } from "../../src/providers/types.js";

/** The class in `instance`'s prototype chain that declares `name`. */
function methodOwner(instance: object, name: string): string {
  let proto: object | null = Object.getPrototypeOf(instance) as object | null;
  while (proto !== null && proto !== Object.prototype) {
    if (Object.prototype.hasOwnProperty.call(proto, name)) {
      const ctor = (proto as { constructor?: { name?: string } }).constructor;
      return ctor?.name ?? "anonymous";
    }
    proto = Object.getPrototypeOf(proto) as object | null;
  }
  return "none";
}

/**
 * True when `inner` overrides `name` and `decorated` does not — i.e. wrapping
 * silently swapped a real implementation for the base one.
 *
 * A decorator that *does* declare the method is out of scope here: whether it
 * forwards correctly is a behavioural question, and the round-trip test below
 * is what answers it.
 */
function dropsOverride(
  decorated: object,
  inner: object,
  name: string
): boolean {
  return (
    methodOwner(inner, name) !== "BaseProvider" &&
    methodOwner(decorated, name) === "BaseProvider"
  );
}

/** A provider whose own `generateLoop` is distinguishable from the base one. */
class LoopOwningProvider extends BaseProvider {
  readonly provider = "openai" as const;

  async *generateMessages(): AsyncGenerator<ProviderStreamItem> {
    yield { type: "chunk", content: "base-loop", done: true };
  }

  async generateMessage(): Promise<never> {
    throw new Error("not used");
  }

  override async *generateLoop(): AsyncGenerator<ProviderStreamItem> {
    yield { type: "chunk", content: "own-loop", done: true };
  }
}

/** The real bug: a decorator that forgets `generateLoop`. */
class DroppingDecorator extends BaseProvider {
  readonly provider = "openai" as const;

  constructor(readonly inner: BaseProvider) {
    super(inner.provider);
  }

  async *generateMessages(): AsyncGenerator<ProviderStreamItem> {
    yield { type: "chunk", content: "base-loop", done: true };
  }

  async generateMessage(): Promise<never> {
    throw new Error("not used");
  }
}

/** The same decorator, forwarding the method it must not swallow. */
class ForwardingDecorator extends DroppingDecorator {
  override async *generateLoop(
    ...args: Parameters<BaseProvider["generateLoop"]>
  ): AsyncGenerator<ProviderStreamItem> {
    yield* this.inner.generateLoop(...args);
  }
}

async function collect(
  gen: AsyncGenerator<ProviderStreamItem>
): Promise<string> {
  const parts: string[] = [];
  for await (const item of gen) {
    if (item.type === "chunk") parts.push(item.content);
  }
  return parts.join("");
}

const ONE_TURN = { messages: [{ role: "user" as const, content: "hi" }] };

describe("provider decorator inertness — structural", () => {
  it("catches a decorator that drops an overridden generateLoop", () => {
    const inner = new LoopOwningProvider();
    const dropped = new DroppingDecorator(inner);

    // The defect, named exactly: the inner owns the loop, the wrapper resolves
    // back to the base one.
    expect(methodOwner(inner, "generateLoop")).toBe("LoopOwningProvider");
    expect(methodOwner(dropped, "generateLoop")).toBe("BaseProvider");
    expect(dropsOverride(dropped, inner, "generateLoop")).toBe(true);
  });

  it("passes a decorator that forwards it", () => {
    const inner = new LoopOwningProvider();
    const forwarding = new ForwardingDecorator(inner);

    expect(methodOwner(forwarding, "generateLoop")).toBe("ForwardingDecorator");
    expect(dropsOverride(forwarding, inner, "generateLoop")).toBe(false);
  });

  it("does not flag a decorator whose inner never overrode the method", () => {
    // Wrapping a provider that uses the base loop cannot change which loop
    // runs, so this is not a finding — otherwise the check would report every
    // decorator in the codebase.
    class PlainProvider extends BaseProvider {
      readonly provider = "openai" as const;
      async *generateMessages(): AsyncGenerator<ProviderStreamItem> {
        yield { type: "chunk", content: "x", done: true };
      }
      async generateMessage(): Promise<never> {
        throw new Error("not used");
      }
    }
    const inner = new PlainProvider();
    expect(dropsOverride(new DroppingDecorator(inner), inner, "generateLoop")).toBe(
      false
    );
  });
});

describe("provider decorator inertness — behavioural", () => {
  it("a dropped generateLoop changes what the run produces", async () => {
    const inner = new LoopOwningProvider();

    const unwrapped = await collect(inner.generateLoop(ONE_TURN));
    const wrapped = await collect(
      new DroppingDecorator(inner).generateLoop(ONE_TURN)
    );

    // This inequality IS the bug: same provider, same call, different loop.
    expect(unwrapped).toBe("own-loop");
    expect(wrapped).toBe("base-loop");
    expect(wrapped).not.toBe(unwrapped);
  });

  it("a forwarding decorator is indistinguishable from the inner provider", async () => {
    const inner = new LoopOwningProvider();

    const unwrapped = await collect(inner.generateLoop(ONE_TURN));
    const wrapped = await collect(
      new ForwardingDecorator(inner).generateLoop(ONE_TURN)
    );

    expect(wrapped).toBe(unwrapped);
  });
});

describe("the real CassetteProvider", () => {
  it("drops OpenAIProvider's Responses loop when it wraps one", () => {
    // Recorded, not fixed. `CassetteProvider` is a record/replay decorator that
    // overrides generateMessage/generateMessages and not generateLoop, so
    // wrapping either loop-owning provider replaces its loop with the base one.
    // Whether it should forward, or refuse to wrap a loop-owning provider, is a
    // design decision — this test pins today's behaviour so the decision is
    // made rather than discovered mid-eval.
    // Which class owns the method is a property of the prototypes, so this
    // needs no credential and no network — `Object.create` gives an object
    // with the real chain behind it. Constructing an OpenAIProvider would
    // demand OPENAI_API_KEY and prove nothing extra.
    const inner = Object.create(OpenAIProvider.prototype) as object;
    const wrapped = Object.create(CassetteProvider.prototype) as object;

    expect(methodOwner(inner, "generateLoop")).toBe("OpenAIProvider");
    expect(methodOwner(wrapped, "generateLoop")).toBe("BaseProvider");
    expect(dropsOverride(wrapped, inner, "generateLoop")).toBe(true);
  });

  it("is inert for a provider that uses the base loop", () => {
    // The wrap is only lossy for providers that own their loop — which is why
    // it went unnoticed: against a plain provider the cassette is inert.
    class PlainProvider extends BaseProvider {
      readonly provider = "openai" as const;
      async *generateMessages(): AsyncGenerator<ProviderStreamItem> {
        yield { type: "chunk", content: "x", done: true };
      }
      async generateMessage(): Promise<never> {
        throw new Error("not used");
      }
    }
    const inner = new PlainProvider();
    expect(
      dropsOverride(new CassetteProvider(inner), inner, "generateLoop")
    ).toBe(false);
  });
});
