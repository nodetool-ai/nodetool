import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  PlanApprovalCard,
  SecretRequestCard,
  ToolApprovalCard
} from "../ApprovalCards.js";
import { PermissionModePicker } from "../PermissionModePicker.js";

describe("approval UI", () => {
  it("renders every tool approval decision and separates code from arguments", () => {
    const html = renderToStaticMarkup(
      <ToolApprovalCard
        request={{
          type: "tool_approval_request",
          thread_id: "thread-1",
          approval_id: "approval-1",
          tool_name: "write_file",
          category: "write",
          message: "Write a configuration file",
          args: { code: "export default {};", path: "config.ts" }
        }}
        onResolve={() => true}
      />
    );

    expect(html).toContain("Make this change?");
    expect(html).toContain("Show code");
    expect(html).toContain("Show arguments");
    expect(html).toContain("Allow for chat");
    expect(html).toContain("Deny");
  });

  it("renders plan review, credential entry, and permission mode controls", () => {
    const planHtml = renderToStaticMarkup(
      <PlanApprovalCard
        request={{
          type: "plan_approval_request",
          thread_id: "thread-1",
          approval_id: "plan-1",
          plan: {
            title: "Update the extension",
            tasks: [
              {
                id: "task-1",
                title: "Implement UI",
                depends_on: [],
                steps: [{ id: "step-1", instructions: "Add approval cards" }]
              }
            ]
          }
        }}
        onResolve={() => true}
      />
    );
    const secretHtml = renderToStaticMarkup(
      <SecretRequestCard
        request={{
          type: "secret_request",
          thread_id: "thread-1",
          approval_id: "secret-1",
          key: "OPENAI_API_KEY",
          description: "Used by the selected provider",
          reason: "The provider needs a credential",
          help_url: "https://platform.openai.com/api-keys"
        }}
        onSave={vi.fn()}
        onDecline={vi.fn()}
      />
    );
    const pickerHtml = renderToStaticMarkup(
      <PermissionModePicker value="default" onChange={vi.fn()} />
    );

    expect(planHtml).toContain("Run plan");
    expect(planHtml).toContain("Revise");
    expect(planHtml).toContain("Don&#x27;t run");
    expect(secretHtml).toContain("OPENAI_API_KEY");
    expect(secretHtml).toContain("Where to get this key");
    expect(pickerHtml).toContain("Ask");
    expect(pickerHtml).toContain("Auto");
    expect(pickerHtml).toContain("Plan");
  });
});
