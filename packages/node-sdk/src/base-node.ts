import type { NodeDescriptor, SyncMode } from "@nodetool/protocol";
import type { NodeExecutor } from "@nodetool/kernel";
import type { ProcessingContext } from "@nodetool/runtime";
import { getDeclaredPropertiesForClass } from "./decorators.js";

export interface DeclaredOutputTypes {
  [name: string]: string;
}

export type NodeClass = {
  new (properties?: Record<string, unknown>): BaseNode;
  nodeType: string;
  title: string;
  description: string;
  layout?: string;
  theModelInfo?: Record<string, unknown>;
  recommendedModels?: unknown[];
  basicFields?: string[];
  requiredSettings?: string[];
  isStreamingInput: boolean;
  isStreamingOutput: boolean;
  isDynamic: boolean;
  syncMode: SyncMode;
  isControlled: boolean;
  exposeAsTool?: boolean;
  supportsDynamicOutputs?: boolean;
  modelPacks?: unknown[];
  metadataOutputTypes?: DeclaredOutputTypes;
  outputTypes: DeclaredOutputTypes;
  getDeclaredProperties(): Array<{ name: string; options: { type: string; default?: unknown } }>;
  getDeclaredOutputs(): Record<string, string>;
  toDescriptor(id?: string): NodeDescriptor;
};

export abstract class BaseNode {
  static readonly nodeType: string = "";
  static readonly title: string = "";
  static readonly description: string = "";
  static readonly layout: string | undefined = undefined;
  static readonly theModelInfo: Record<string, unknown> | undefined = undefined;
  static readonly recommendedModels: unknown[] | undefined = undefined;
  static readonly basicFields: string[] | undefined = undefined;
  static readonly requiredSettings: string[] | undefined = undefined;
  static readonly isStreamingInput: boolean = false;
  static readonly isStreamingOutput: boolean = false;
  static readonly isDynamic: boolean = false;
  static readonly syncMode: SyncMode = "zip_all";
  static readonly isControlled: boolean = false;
  static readonly exposeAsTool: boolean | undefined = undefined;
  static readonly supportsDynamicOutputs: boolean | undefined = undefined;
  static readonly modelPacks: unknown[] | undefined = undefined;
  static readonly metadataOutputTypes: DeclaredOutputTypes | undefined = undefined;
  static readonly outputTypes: DeclaredOutputTypes = {};

  __node_id = "";
  __node_name = "";
  [key: string]: unknown;

  protected dynamicProps = new Map<string, unknown>();

  constructor(properties: Record<string, unknown> = {}) {
    this.assign(properties);
  }

  static getDeclaredProperties() {
    return getDeclaredPropertiesForClass(this);
  }

  static getDeclaredOutputs(): Record<string, string> {
    return { ...(this.outputTypes ?? {}) };
  }

  assign(properties: Record<string, unknown>): void {
    const ctor = this.constructor as typeof BaseNode;
    const declared = ctor.getDeclaredProperties();
    const defaults: Record<string, unknown> = {};

    for (const prop of declared) {
      if (Object.prototype.hasOwnProperty.call(prop.options, "default")) {
        defaults[prop.name] = prop.options.default;
      }
    }

    const merged = { ...defaults, ...properties };
    if (Object.prototype.hasOwnProperty.call(properties, "__node_id")) {
      this.__node_id = String(properties.__node_id ?? "");
    }
    if (Object.prototype.hasOwnProperty.call(properties, "__node_name")) {
      this.__node_name = String(properties.__node_name ?? "");
    }
    for (const { name } of declared) {
      if (Object.prototype.hasOwnProperty.call(merged, name)) {
        (this as Record<string, unknown>)[name] = merged[name];
      }
    }
  }

  serialize(): Record<string, unknown> {
    const ctor = this.constructor as typeof BaseNode;
    const result: Record<string, unknown> = {};

    for (const { name } of ctor.getDeclaredProperties()) {
      result[name] = (this as Record<string, unknown>)[name];
    }

    return result;
  }

  deserialize(data: Record<string, unknown>): void {
    this.assign(data);
  }

  setDynamic(key: string, value: unknown): void {
    this.dynamicProps.set(key, value);
  }

  getDynamic<T = unknown>(key: string): T | undefined {
    return this.dynamicProps.get(key) as T | undefined;
  }

  async initialize(): Promise<void> {}
  async preProcess(): Promise<void> {}
  async finalize(): Promise<void> {}

  abstract process(
    inputs: Record<string, unknown>,
    context?: ProcessingContext
  ): Promise<Record<string, unknown>>;

  async *genProcess(
    inputs: Record<string, unknown>,
    context?: ProcessingContext
  ): AsyncGenerator<Record<string, unknown>> {
    yield await this.process(inputs, context);
  }

  toExecutor(): NodeExecutor {
    return {
      process: (inputs: Record<string, unknown>, context?: ProcessingContext) =>
        this.process(inputs, context),
      genProcess: (inputs: Record<string, unknown>, context?: ProcessingContext) =>
        this.genProcess(inputs, context),
      preProcess: () => this.preProcess(),
      finalize: () => this.finalize(),
      initialize: () => this.initialize(),
    };
  }

  static toDescriptor(id?: string): NodeDescriptor {
    const cls = this as unknown as typeof BaseNode;
    const propertyTypes = Object.fromEntries(
      cls.getDeclaredProperties().map((entry) => [entry.name, entry.options.type]),
    );
    const desc: NodeDescriptor = {
      id: id ?? cls.nodeType,
      type: cls.nodeType,
      name: cls.title,
      is_streaming_input: cls.isStreamingInput,
      is_streaming_output: cls.isStreamingOutput,
      sync_mode: cls.syncMode,
      is_controlled: cls.isControlled,
    };
    if (Object.keys(propertyTypes).length > 0) {
      desc.propertyTypes = propertyTypes;
    }
    const outputs = cls.getDeclaredOutputs();
    if (Object.keys(outputs).length > 0) {
      desc.outputs = outputs;
    }
    return desc;
  }
}
