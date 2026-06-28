import { describe, it, expect } from "vitest";
import { BaseProvider } from "../../src/providers/base-provider.js";
import { FakeProvider } from "../../src/providers/fake-provider.js";
import {
  CassetteProvider,
  CassetteStore,
  createEmptyCassette,
  hashRequest,
  normalizeRequest,
  stableStringify
} from "../../src/providers/cassette-provider.js";
import type { Cassette } from "../../src/providers/cassette-provider.js";
import type {
  Message,
  ProviderStreamItem
} from "../../src/providers/types.js";

const USER: Message[] = [{ role: "user", content: "hello" }];

async function collect(
  gen: AsyncGenerator<ProviderStreamItem>
): Promise<ProviderStreamItem[]> {
  const items: ProviderStreamItem[] = [];
  for await (const item of gen) items.push(item);
  return items;
}

/**
 * Inner provider that throws on any chat call — proves replay never touches the
 * inner provider (no network / no inner call).
 */
class PoisonProvider extends BaseProvider {
  constructor() {
    super("openai");
  }
  async generateMessage(): Promise<Message> {
    throw new Error("PoisonProvider.generateMessage must not be called");
  }
  async *generateMessages(): AsyncGenerator<ProviderStreamItem> {
    yield* [];
    throw new Error("PoisonProvider.generateMessages must not be called");
  }
}

/** Inner provider that tracks token usage so cost reproduction can be tested. */
class UsageProvider extends BaseProvider {
  constructor() {
    super("openai");
  }
  async generateMessage(args: {
    messages: Message[];
    model: string;
  }): Promise<Message> {
    this.trackUsage(args.model, { inputTokens: 1000, outputTokens: 500 });
    return { role: "assistant", content: [{ type: "text", text: "ok" }] };
  }
  async *generateMessages(args: {
    messages: Message[];
    model: string;
  }): AsyncGenerator<ProviderStreamItem> {
    yield { type: "chunk", content: "ok", done: true, content_type: "text" };
    this.trackUsage(args.model, { inputTokens: 1000, outputTokens: 500 });
  }
}

describe("stableStringify", () => {
  it("is key-order independent", () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(
      stableStringify({ a: 2, b: 1 })
    );
  });

  it("preserves array order", () => {
    expect(stableStringify([1, 2, 3])).not.toBe(stableStringify([3, 2, 1]));
  });

  it("encodes byte arrays stably", () => {
    const a = stableStringify({ data: new Uint8Array([1, 2, 3]) });
    const b = stableStringify({ data: new Uint8Array([1, 2, 3]) });
    expect(a).toBe(b);
    expect(a).toContain("__bytes__:");
  });
});

describe("hashRequest", () => {
  it("is scoped by method", () => {
    const req = normalizeRequest({ messages: USER, model: "m" });
    expect(hashRequest("generateMessage", req)).not.toBe(
      hashRequest("generateMessages", req)
    );
  });

  it("ignores runtime-only fields not in the normalized request", () => {
    const a = normalizeRequest({ messages: USER, model: "m", temperature: 0.5 });
    const b = normalizeRequest({ messages: USER, model: "m", temperature: 0.5 });
    expect(hashRequest("generateMessages", a)).toBe(
      hashRequest("generateMessages", b)
    );
  });
});

describe("CassetteProvider record → replay (generateMessages)", () => {
  it("records from FakeProvider then replays without touching the inner provider", async () => {
    const cassette = createEmptyCassette();
    const fake = new FakeProvider({
      textResponse: "Streaming hello world response",
      shouldStream: true,
      chunkSize: 7
    });
    const recorder = new CassetteProvider(fake, { mode: "record", cassette });

    const recorded = await collect(
      recorder.generateMessages({ messages: USER, model: "fake-model" })
    );
    expect(recorded.length).toBeGreaterThan(1);
    expect(cassette.interactions).toHaveLength(1);

    // Replay over a poison provider — any inner call throws.
    const replayer = new CassetteProvider(new PoisonProvider(), {
      mode: "replay",
      cassette
    });
    const replayed = await collect(
      replayer.generateMessages({ messages: USER, model: "fake-model" })
    );
    expect(replayed).toEqual(recorded);
  });
});

describe("CassetteProvider record → replay (generateMessage)", () => {
  it("replays the single-shot message without the inner provider", async () => {
    const cassette = createEmptyCassette();
    const fake = new FakeProvider({ textResponse: "single shot", shouldStream: false });
    const recorder = new CassetteProvider(fake, { mode: "record", cassette });
    const recorded = await recorder.generateMessage({
      messages: USER,
      model: "fake-model"
    });

    const replayer = new CassetteProvider(new PoisonProvider(), {
      mode: "replay",
      cassette
    });
    const replayed = await replayer.generateMessage({
      messages: USER,
      model: "fake-model"
    });
    expect(replayed).toEqual(recorded);
  });
});

describe("CassetteProvider determinism", () => {
  it("two consecutive replays of the same request yield identical output", async () => {
    const cassette = createEmptyCassette();
    const fake = new FakeProvider({
      textResponse: "deterministic content here",
      shouldStream: true,
      chunkSize: 5
    });
    await collect(
      new CassetteProvider(fake, { mode: "record", cassette }).generateMessages({
        messages: USER,
        model: "fake-model"
      })
    );

    const replayer = new CassetteProvider(new PoisonProvider(), {
      mode: "replay",
      cassette
    });
    const first = await collect(
      replayer.generateMessages({ messages: USER, model: "fake-model" })
    );
    const second = await collect(
      replayer.generateMessages({ messages: USER, model: "fake-model" })
    );
    expect(second).toEqual(first);
  });
});

describe("CassetteProvider auto mode", () => {
  it("records on miss, replays on subsequent hit", async () => {
    const cassette = createEmptyCassette();
    const fake = new FakeProvider({ textResponse: "auto", shouldStream: false });
    const provider = new CassetteProvider(fake, { mode: "auto", cassette });

    await collect(
      provider.generateMessages({ messages: USER, model: "fake-model" })
    );
    expect(cassette.interactions).toHaveLength(1);
    expect(fake.callCount).toBe(1);

    // Second identical call is a hit — inner provider not invoked again.
    await collect(
      provider.generateMessages({ messages: USER, model: "fake-model" })
    );
    expect(cassette.interactions).toHaveLength(1);
    expect(fake.callCount).toBe(1);
  });
});

describe("CassetteProvider replay miss", () => {
  it("throws a clear Error for an unrecorded streaming request", async () => {
    const replayer = new CassetteProvider(new PoisonProvider(), {
      mode: "replay",
      cassette: createEmptyCassette()
    });
    await expect(
      collect(
        replayer.generateMessages({ messages: USER, model: "missing-model" })
      )
    ).rejects.toThrow(/replay miss/i);
  });

  it("throws a clear Error for an unrecorded single-shot request", async () => {
    const replayer = new CassetteProvider(new PoisonProvider(), {
      mode: "replay",
      cassette: createEmptyCassette()
    });
    await expect(
      replayer.generateMessage({ messages: USER, model: "missing-model" })
    ).rejects.toThrow(/replay miss/i);
  });
});

describe("CassetteProvider disk round-trip", () => {
  it("saves to a temp file and replays after load", async () => {
    const os = await import("node:os");
    const path = await import("node:path");
    const fsP = await import("node:fs/promises");
    const file = path.join(
      os.tmpdir(),
      `cassette-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
    );

    try {
      const fake = new FakeProvider({
        textResponse: "persist me across disk",
        shouldStream: true,
        chunkSize: 6
      });
      const recorder = new CassetteProvider(fake, {
        mode: "record",
        cassette: createEmptyCassette(),
        path: file
      });
      const recorded = await collect(
        recorder.generateMessages({ messages: USER, model: "fake-model" })
      );
      await recorder.save();

      // Fresh provider from disk, replaying over a poison inner provider.
      const loaded: Cassette = await CassetteStore.load(file);
      const replayer = new CassetteProvider(new PoisonProvider(), {
        mode: "replay",
        cassette: loaded
      });
      const replayed = await collect(
        replayer.generateMessages({ messages: USER, model: "fake-model" })
      );
      expect(replayed).toEqual(recorded);

      // fromFile convenience loads the same cassette.
      const viaFromFile = await CassetteProvider.fromFile(
        new PoisonProvider(),
        file,
        { mode: "replay" }
      );
      const replayed2 = await collect(
        viaFromFile.generateMessages({ messages: USER, model: "fake-model" })
      );
      expect(replayed2).toEqual(recorded);
    } finally {
      await fsP.rm(file, { force: true });
    }
  });
});

describe("CassetteProvider usage/cost reproduction", () => {
  it("reproduces recorded cost on replay (generateMessages)", async () => {
    const cassette = createEmptyCassette();
    const recorder = new CassetteProvider(new UsageProvider(), {
      mode: "record",
      cassette
    });
    await collect(
      recorder.generateMessages({ messages: USER, model: "gpt-4o" })
    );
    const recordedCost = recorder.getTotalCost();
    expect(recordedCost).toBeGreaterThan(0);
    expect(cassette.interactions[0].usage).toEqual({
      inputTokens: 1000,
      outputTokens: 500
    });

    const replayer = new CassetteProvider(new PoisonProvider(), {
      mode: "replay",
      cassette
    });
    await collect(
      replayer.generateMessages({ messages: USER, model: "gpt-4o" })
    );
    expect(replayer.getTotalCost()).toBeCloseTo(recordedCost, 10);
  });

  it("reproduces recorded cost on replay (generateMessage)", async () => {
    const cassette = createEmptyCassette();
    const recorder = new CassetteProvider(new UsageProvider(), {
      mode: "record",
      cassette
    });
    await recorder.generateMessage({ messages: USER, model: "gpt-4o" });
    const recordedCost = recorder.getTotalCost();
    expect(recordedCost).toBeGreaterThan(0);

    const replayer = new CassetteProvider(new PoisonProvider(), {
      mode: "replay",
      cassette
    });
    await replayer.generateMessage({ messages: USER, model: "gpt-4o" });
    expect(replayer.getTotalCost()).toBeCloseTo(recordedCost, 10);
  });
});

describe("CassetteProvider provider id", () => {
  it("adopts the inner provider's id", () => {
    const provider = new CassetteProvider(new FakeProvider());
    expect(provider.provider).toBe("fake");
  });
});
