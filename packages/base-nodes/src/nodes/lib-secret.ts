import { BaseNode, prop } from "@nodetool/node-sdk";
import type { ProcessingContext } from "@nodetool/runtime";

export class GetSecretLibNode extends BaseNode {
  static readonly nodeType = "lib.secret.GetSecret";
            static readonly title = "Get Secret";
            static readonly description = "Get a secret value from configuration.\n    secrets, credentials, configuration";
        static readonly metadataOutputTypes = {
    output: "str"
  };
  
  @prop({ type: "str", default: "", title: "Name", description: "Secret key name" })
  declare name: any;

  @prop({ type: "str", default: "", title: "Default", description: "Default value if not found" })
  declare default: any;




  async process(
    inputs: Record<string, unknown>,
    context?: ProcessingContext
  ): Promise<Record<string, unknown>> {
    const name = String(inputs.name ?? this.name ?? "");
    const defaultValue = String(inputs.default ?? this.default ?? "");
    if (!name) {
      return { output: defaultValue };
    }

    const secret = (await context?.getSecret(name)) ?? process.env[name] ?? null;
    return { output: secret ?? defaultValue };
  }
}

export const LIB_SECRET_NODES = [GetSecretLibNode] as const;
