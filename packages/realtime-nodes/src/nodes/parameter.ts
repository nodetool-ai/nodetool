import { BaseNode, prop } from "@nodetool/node-sdk";

export class Parameter extends BaseNode {
  static readonly nodeType = "nodetool.realtime.Parameter";
  static readonly title = "Realtime Parameter";
  static readonly description =
    "Realtime control parameter. Live updates are routed to this node by name during a session.";
  static readonly metadataOutputTypes = {
    value: "any"
  };
  static readonly basicFields = ["name", "value"];
  static readonly isControlled = true;
  static readonly isRealtimeCapable = true;

  @prop({
    type: "str",
    default: "",
    title: "Name",
    description: "The parameter name used by update_realtime_session."
  })
  declare name: string;

  @prop({
    type: "any",
    default: null,
    title: "Value",
    description: "The current parameter value."
  })
  declare value: unknown;

  @prop({
    type: "str",
    default: "",
    title: "Description",
    description: "The description of this realtime control."
  })
  declare description: string;

  async process(): Promise<Record<string, unknown>> {
    return { value: this.value ?? null };
  }
}

export const PARAMETER_NODES = [Parameter] as const;
