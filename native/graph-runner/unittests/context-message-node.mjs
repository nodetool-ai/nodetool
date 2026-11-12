import { BaseNode } from "@nodetool-ai/node-sdk";
// A test node deliberately emits a terminal-shaped processing message. The
// public host must forward it as ordinary data and retain terminal authority.
export class ContextMessageNode extends BaseNode {
  static nodeType = "fixture.ContextMessage";
  static supportsDynamicInputs = true;
  static metadataOutputTypes = { value: "str" };
  constructor(properties = {}) {
    super(properties);
    this.label = properties.label ?? "fixture";
    this.count = properties.count ?? 1;
    this.spoof = properties.spoof ?? false;
    this.environment = properties.environment ?? false;
    this.padding = properties.padding ?? 0;
  }
  async process(context) {
    if (this.environment) {
      if (
        process.env.NODETOOL_TIMELINE_RENDERER !== "node" ||
        context.environment.NODETOOL_TIMELINE_RENDERER !== "node" ||
        process.env.EPHEMERAL !== undefined ||
        process.env.HOME !== undefined
      )
        throw new Error(
          "Explicit virtual environment was missing or leaked between jobs"
        );
      process.env.EPHEMERAL = this.label;
    }
    for (let index = 0; index < this.count; index++)
      context.postMessage({
        type: "node_log",
        node_id: this.__node_id,
        job_id: context.jobId,
        content: this.padding ? this.label + "x".repeat(this.padding) : this.label,
        index
      });
    if (this.spoof)
      context.postMessage({
        type: "job_update",
        job_id: "spoof",
        status: "completed",
        result: { outputs: { spoof: true } }
      });
    return { value: this.label };
  }
}
