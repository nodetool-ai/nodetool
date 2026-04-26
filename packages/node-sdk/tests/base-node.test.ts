import { describe, it, expect, vi } from "vitest";
import { BaseNode } from "../src/base-node.js";
import { prop } from "../src/decorators.js";

// Concrete subclass for testing
class ConcreteNode extends BaseNode {
  static readonly nodeType = "test.Concrete";
  static readonly title = "Concrete";
  static readonly description = "Test node";
  static readonly isRealtimeCapable = true;
  static readonly ownsWarmState = true;
  static readonly isMediaAdapter = true;
  static readonly inputBufferPolicy = {
    x: { capacity: 2, overflowPolicy: "drop_oldest" as const }
  };

  @prop({ type: "int", default: 10 })
  declare x: number;

  @prop({ type: "str", default: "hello" })
  declare y: string;

  async process(): Promise<Record<string, unknown>> {
    return { out: this.x };
  }
}

class BrowserRealtimeNode extends BaseNode {
  static readonly nodeType = "test.BrowserRealtime";
  static readonly title = "Browser Realtime";
  static readonly realtimeProfile = {
    browser_capable: true,
    requires_browser_frame: true,
    requires_webgpu: true,
    emits_analysis_event: true,
    emits_parameter_update: false,
    emits_media_frame: false
  };

  async process(): Promise<Record<string, unknown>> {
    return {};
  }
}

describe("BaseNode", () => {
  it("can instantiate a concrete subclass", () => {
    const node = new ConcreteNode();
    expect(node).toBeInstanceOf(BaseNode);
  });

  it("decorator defaults are applied during assign()", () => {
    const node = new ConcreteNode();
    node.assign({});
    expect(node.x).toBe(10);
    expect(node.y).toBe("hello");
  });

  it("assign() overrides defaults with provided properties", () => {
    const node = new ConcreteNode();
    node.assign({ x: 42 });
    expect(node.x).toBe(42);
    expect(node.y).toBe("hello");
  });

  it("process() is called by toExecutor()", async () => {
    const node = new ConcreteNode();
    const executor = node.toExecutor();
    const result = await executor.process({ x: 7 });
    expect(result.out).toBe(7);
  });

  it("lifecycle hooks are called by executor", async () => {
    const calls: string[] = [];
    class HookNode extends BaseNode {
      static readonly nodeType = "test.Hook";
      async initialize() {
        calls.push("initialize");
      }
      async preProcess() {
        calls.push("preProcess");
      }
      async finalize() {
        calls.push("finalize");
      }
      async process() {
        calls.push("process");
        return {};
      }
    }
    const node = new HookNode();
    const exec = node.toExecutor();
    await exec.initialize?.();
    await exec.preProcess?.();
    await exec.process({});
    await exec.finalize?.();
    expect(calls).toEqual(["initialize", "preProcess", "process", "finalize"]);
  });

  it("genProcess() streams outputs via executor", async () => {
    class StreamNode extends BaseNode {
      static readonly nodeType = "test.Stream";
      static readonly isStreamingOutput = true;
      async process() {
        return {};
      }
      async *genProcess() {
        yield { value: 1 };
        yield { value: 2 };
      }
    }
    const node = new StreamNode();
    const exec = node.toExecutor();
    const results: Record<string, unknown>[] = [];
    for await (const item of exec.genProcess!({})) {
      results.push(item);
    }
    expect(results).toEqual([{ value: 1 }, { value: 2 }]);
  });

  it("toDescriptor() returns proper NodeDescriptor", () => {
    const desc = ConcreteNode.toDescriptor("my-id");
    expect(desc.id).toBe("my-id");
    expect(desc.type).toBe("test.Concrete");
    expect(desc.name).toBe("Concrete");
    expect(desc.is_streaming_input).toBe(false);
    expect(desc.is_streaming_output).toBe(false);
    expect(desc.is_controlled).toBe(false);
    expect(desc.is_realtime_capable).toBe(true);
    expect(desc.owns_warm_state).toBe(true);
    expect(desc.is_media_adapter).toBe(true);
    expect(desc.inputBufferPolicy).toEqual({
      x: { capacity: 2, overflowPolicy: "drop_oldest" }
    });
  });

  it("toDescriptor() uses nodeType as id when none provided", () => {
    const desc = ConcreteNode.toDescriptor();
    expect(desc.id).toBe("test.Concrete");
  });

  it("toDescriptor() includes opt-in realtime browser capability profile", () => {
    const desc = BrowserRealtimeNode.toDescriptor("browser-node");

    expect(desc.realtime_profile).toEqual({
      browser_capable: true,
      requires_browser_frame: true,
      requires_webgpu: true,
      emits_analysis_event: true,
      emits_parameter_update: false,
      emits_media_frame: false
    });
  });

  it("session lifecycle hooks are overrideable and default to no-op", async () => {
    const events: string[] = [];

    class SessionNode extends BaseNode {
      static readonly nodeType = "test.Session";

      async onSessionStart() {
        events.push("start");
      }

      async onSessionStop() {
        events.push("stop");
      }

      resetWarmState() {
        events.push("reset");
      }

      async process(): Promise<Record<string, unknown>> {
        return {};
      }
    }

    const sessionNode = new SessionNode();
    await sessionNode.onSessionStart({} as never, {} as never);
    sessionNode.resetWarmState();
    await sessionNode.onSessionStop({} as never, {} as never);

    const plainNode = new ConcreteNode();
    await expect(
      plainNode.onSessionStart({} as never, {} as never)
    ).resolves.toBeUndefined();
    expect(() => plainNode.resetWarmState()).not.toThrow();
    await expect(
      plainNode.onSessionStop({} as never, {} as never)
    ).resolves.toBeUndefined();

    expect(events).toEqual(["start", "reset", "stop"]);
  });
});
