/**
 * Provider contract suite — enumerates `provider-registry.ts` (not a
 * hand-written list) and asserts the `BaseProvider` contract against every
 * registered provider via cassette playback: streaming shape, error
 * taxonomy, cost fields, and cancellation.
 *
 * See docs/RELIABILITY_TASKS.md Track E, task E1 and
 * docs/RELIABILITY_ARCHITECTURE.md §8 point 3.
 *
 * Registering a new provider with no cassette at
 * `tests/fixtures/provider-cassettes/<id>.json` fails this suite — see
 * `loadContractCassette` below — unless the id is listed in
 * `MEDIA_ONLY_EXEMPTIONS` (provider-contract.fixtures.ts) with a
 * justification. That list itself is asserted against the provider's
 * source (`rejects chat cleanly`), so an exemption cannot silently rot.
 */
import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  listRegisteredProviderIds,
  getProvider
} from "../src/providers/provider-registry.js";
// Import side effect: registers every built-in provider (index.ts's
// module-level registerBuiltinProvider calls). Nothing else in this file
// hand-lists providers — `listRegisteredProviderIds()` below is the single
// source of truth this suite enumerates.
import "../src/providers/index.js";
import { CLOUD_ONLY_PROVIDER_IDS } from "@nodetool-ai/protocol";
import {
  CassetteProvider,
  CassetteStore
} from "../src/providers/cassette-provider.js";
import type { Cassette } from "../src/providers/cassette-provider.js";
import type { BaseProvider } from "../src/providers/base-provider.js";
import type { Chunk, Message, ProviderStreamItem } from "../src/providers/types.js";
import {
  CONTRACT_MESSAGES,
  CONTRACT_MODEL,
  CONTRACT_MODEL_RATE_LIMIT,
  CONTRACT_MODEL_AUTH_ERROR,
  MEDIA_ONLY_EXEMPTIONS
} from "./providers/provider-contract.fixtures.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CASSETTE_DIR = path.join(__dirname, "fixtures", "provider-cassettes");

/** Every kwarg/secret resolves to a non-empty dummy value — exactly enough
 * for constructors that require a credential to be *present*, never a real
 * one, since replay never touches the network. */
const dummySecret = async (key: string): Promise<string> =>
  `contract-test-${key}`;

async function collect(
  gen: AsyncGenerator<ProviderStreamItem>
): Promise<ProviderStreamItem[]> {
  const items: ProviderStreamItem[] = [];
  for await (const item of gen) items.push(item);
  return items;
}

function isChunk(item: ProviderStreamItem): item is Chunk {
  return (
    typeof item === "object" &&
    item !== null &&
    "type" in item &&
    (item as { type?: unknown }).type === "chunk"
  );
}

/**
 * Load a provider's contract cassette, or fail with a message that names the
 * provider and the exact path a cassette must go — this IS the "no cassette
 * fails CI" gate, not an aside.
 */
async function loadContractCassette(id: string): Promise<Cassette> {
  const file = path.join(CASSETTE_DIR, `${id}.json`);
  try {
    return await CassetteStore.load(file);
  } catch {
    throw new Error(
      `Provider "${id}" is registered in provider-registry.ts but has no ` +
        `contract cassette at ${file}. Every registered provider must ship ` +
        `a cassette for provider-contract.test.ts — copy the shape of an ` +
        `existing fixture in tests/fixtures/provider-cassettes/ (a Cassette ` +
        `with generateMessages/generateMessage interactions plus scripted ` +
        `429/401 error interactions) — or be added to ` +
        `MEDIA_ONLY_EXEMPTIONS in provider-contract.fixtures.ts with a ` +
        `justification if the provider structurally cannot support chat.`
    );
  }
}

const registeredIds = listRegisteredProviderIds();
const chatProviderIds = registeredIds.filter(
  (id) => !(id in MEDIA_ONLY_EXEMPTIONS)
);
const mediaOnlyIds = registeredIds.filter((id) => id in MEDIA_ONLY_EXEMPTIONS);

describe("provider registry enumeration", () => {
  it("registers at least one provider (sanity check the registry loaded)", () => {
    expect(registeredIds.length).toBeGreaterThan(0);
  });

  it("every MEDIA_ONLY_EXEMPTIONS entry names a live provider", () => {
    // Catches stale exemptions (a provider renamed/removed but the
    // exemption comment left behind) — the exemption list is only honest if
    // every entry is live.
    //
    // "Live" is not the same as "registered here": a cloud-only provider
    // (`nodetool`) is deliberately unregistered off the cloud profile, which
    // is the profile this suite runs under. Naming it in
    // CLOUD_ONLY_PROVIDER_IDS is what keeps it live — delete the provider
    // without deleting that entry and the protocol suite fails instead, so
    // an exemption still cannot rot in either direction.
    for (const id of Object.keys(MEDIA_ONLY_EXEMPTIONS)) {
      if (CLOUD_ONLY_PROVIDER_IDS.includes(id)) {
        expect(registeredIds).not.toContain(id);
        continue;
      }
      expect(registeredIds).toContain(id);
    }
  });

  it("the cloud-only providers really are absent under this profile", () => {
    // Pins the premise the exemption check leans on: if a future edit
    // registers `nodetool` everywhere again, this fails rather than the
    // branch above quietly skipping a provider it should have covered.
    for (const id of CLOUD_ONLY_PROVIDER_IDS) {
      expect(registeredIds).not.toContain(id);
    }
  });
});

describe.each(mediaOnlyIds)("media-only provider: %s", (id) => {
  it(`rejects chat cleanly (exemption: ${MEDIA_ONLY_EXEMPTIONS[id]})`, async () => {
    const provider = await getProvider(id, dummySecret);

    // Not every media-only provider marks `generateMessage` `async` (some
    // throw synchronously rather than returning a rejected Promise), so wrap
    // the call instead of asserting directly on its return value.
    await expect(
      Promise.resolve().then(() =>
        provider.generateMessage({ messages: CONTRACT_MESSAGES, model: CONTRACT_MODEL })
      )
    ).rejects.toThrow();

    await expect(
      collect(
        provider.generateMessages({ messages: CONTRACT_MESSAGES, model: CONTRACT_MODEL })
      )
    ).rejects.toThrow();
  });
});

describe.each(chatProviderIds)("provider contract: %s", (id) => {
  let cassette: Cassette;
  let provider: BaseProvider;

  beforeAll(async () => {
    cassette = await loadContractCassette(id);
    provider = await getProvider(id, dummySecret);
  });

  it("generateMessages streams chunks in the expected shape and order", async () => {
    const replayer = new CassetteProvider(provider, { mode: "replay", cassette });
    const items = await collect(
      replayer.generateMessages({ messages: CONTRACT_MESSAGES, model: CONTRACT_MODEL })
    );

    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(isChunk(item)).toBe(true);
      const chunk = item as Chunk;
      expect(
        typeof chunk.content === "string" || chunk.content instanceof Float32Array
      ).toBe(true);
    }

    // Terminal chunk carries `done: true` — the shape every consumer (kernel
    // node actor, chat WS relay) keys "turn finished" on.
    const last = items[items.length - 1] as Chunk;
    expect(last.done).toBe(true);
  });

  it("generateMessage returns a well-formed assistant Message", async () => {
    const replayer = new CassetteProvider(provider, { mode: "replay", cassette });
    const message: Message = await replayer.generateMessage({
      messages: CONTRACT_MESSAGES,
      model: CONTRACT_MODEL
    });
    expect(message.role).toBe("assistant");
    expect(message.content == null || typeof message.content === "string" || Array.isArray(message.content)).toBe(true);
  });

  it("populates cost/usage accounting fields", async () => {
    const replayer = new CassetteProvider(provider, { mode: "replay", cassette });
    await collect(
      replayer.generateMessages({ messages: CONTRACT_MESSAGES, model: CONTRACT_MODEL })
    );

    // trackUsage always yields a finite, non-negative cost — 0 is a valid
    // fallback for an unpriced model, but NaN/undefined would mean the
    // accounting path broke.
    const cost = replayer.getTotalCost();
    expect(Number.isFinite(cost)).toBe(true);
    expect(cost).toBeGreaterThanOrEqual(0);

    const recordedUsage = cassette.interactions.find(
      (i) => i.method === "generateMessages" && i.request.model === CONTRACT_MODEL
    )?.usage;
    expect(recordedUsage).toBeDefined();
    expect(typeof recordedUsage!.inputTokens).toBe("number");
    expect(typeof recordedUsage!.outputTokens).toBe("number");
  });

  it("aborting mid-stream terminates cleanly (no hang, no unhandled rejection)", async () => {
    const replayer = new CassetteProvider(provider, { mode: "replay", cassette });
    const gen = replayer.generateMessages({
      messages: CONTRACT_MESSAGES,
      model: CONTRACT_MODEL
    });

    const first = await gen.next();
    expect(first.done).toBe(false);

    // Mirrors what a consumer does on AbortSignal fire / breaking a
    // for-await loop early: stop pulling and close the generator. This must
    // resolve (not hang) and must not throw.
    await expect(gen.return(undefined)).resolves.toEqual({
      done: true,
      value: undefined
    });

    // A generator that is actually closed reports done on every subsequent
    // call — a provider that ignored the return() and kept a timer/socket
    // alive would eventually violate this or hang.
    const after = await gen.next();
    expect(after.done).toBe(true);
  });

  it("surfaces a scripted 429 as BaseProvider.isRateLimitError", async () => {
    const replayer = new CassetteProvider(provider, { mode: "replay", cassette });
    let caught: unknown;
    try {
      await collect(
        replayer.generateMessages({
          messages: CONTRACT_MESSAGES,
          model: CONTRACT_MODEL_RATE_LIMIT
        })
      );
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(provider.isRateLimitError(caught)).toBe(true);
  });

  it("surfaces a scripted 401 as BaseProvider.isAuthError", async () => {
    const replayer = new CassetteProvider(provider, { mode: "replay", cassette });
    let caught: unknown;
    try {
      await collect(
        replayer.generateMessages({
          messages: CONTRACT_MESSAGES,
          model: CONTRACT_MODEL_AUTH_ERROR
        })
      );
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(provider.isAuthError(caught)).toBe(true);
  });
});
