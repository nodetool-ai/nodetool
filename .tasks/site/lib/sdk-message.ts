// Minimal local typing for Claude Agent SDK message shapes used by the
// dashboard and CLI. The SDK doesn't export a discriminated union we can
// import; these match the runtime shape closely enough for the surface we
// inspect (text, tool_use, tool_result, result subtype, usage).

export interface SdkContentBlock {
  type?: string;
  text?: string;
  name?: string;
  input?: unknown;
  content?: unknown;
  tool_use_id?: string;
}

export interface SdkMessageEnvelope {
  type?: string;
  subtype?: string;
  session_id?: string;
  message?: { content?: SdkContentBlock[] };
  result?: string;
  is_error?: boolean;
  total_cost_usd?: number;
  usage?: { input_tokens?: number; output_tokens?: number };
}

export function assistantText(blocks: SdkContentBlock[] | undefined): string {
  if (!blocks) return "";
  return blocks
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text!)
    .join("\n")
    .trim();
}

export function toolUses(blocks: SdkContentBlock[] | undefined): SdkContentBlock[] {
  return (blocks ?? []).filter((b) => b.type === "tool_use");
}

export function toolResults(blocks: SdkContentBlock[] | undefined): SdkContentBlock[] {
  return (blocks ?? []).filter((b) => b.type === "tool_result");
}
