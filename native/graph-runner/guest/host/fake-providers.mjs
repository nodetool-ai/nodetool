// Fake providers (HostOptions::fakeProviders): every provider id resolves to
// the runtime's FakeProvider, one instance per id, as createFakeContext in
// packages/runtime/src/testing.ts does. One per id matters because a
// FakeProvider answers tool calls once per instance. The host drops the
// context's provider:* and prediction:* grants, so no provider call reaches
// the embedder, a secret or the network.
import { FakeProvider } from "guest-real:@nodetool-ai/runtime/providers/fake-provider.js";

export function fakeProvidersGranted() {
  return globalThis.__host?.providers?.fake?.() === true;
}

/** A resolver that keeps one FakeProvider per provider id. */
export function fakeProviderResolver() {
  const providers = new Map();
  return (id) => {
    let provider = providers.get(id);
    if (!provider) {
      provider = new FakeProvider();
      providers.set(id, provider);
    }
    return provider;
  };
}
