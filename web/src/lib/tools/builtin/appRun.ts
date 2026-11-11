/**
 * Frontend tools for the app agent of a chat app (`presentation: "chat"`).
 * The agent owns the loop: it reads the running app, shows steps as cards in
 * the thread, writes values, and runs operations. Cards never run anything;
 * a press inside one reaches the agent as an `[app event]` user turn.
 *
 * Every tool takes `app_run_id`, named in the app's system prompt.
 */
import { z } from "zod";

import { FrontendToolRegistry } from "../frontendTools";
import { getChatAppHandler } from "../../../components/appbuilder/chat/chatAppBridge";

const appRunId = z
  .string()
  .describe("The app_run_id named in the app's system prompt.");

FrontendToolRegistry.register({
  name: "ui_app_run_get_state",
  description:
    "Read the running chat app: the current step, the steps in order, every " +
    "value (long ones shortened), the required values still empty, and each " +
    "operation's status and last error.",
  parameters: z.object({ app_run_id: appRunId }),
  async execute({ app_run_id }) {
    return { ok: true, ...getChatAppHandler(app_run_id).getState() };
  }
});

FrontendToolRegistry.register({
  name: "ui_app_run_show_step",
  description:
    "Show one step of the app as a card in the chat and make it the current " +
    "step on the steps bar. The card is live: the user edits its values, and " +
    "a press on one of its buttons comes back to you as an [app event]. " +
    "Returns at once; end your turn and wait for the user.",
  parameters: z.object({
    app_run_id: appRunId,
    step: z.string().describe("The step's value, as listed in the system prompt."),
    note: z
      .string()
      .optional()
      .describe("One short sentence shown above the card."),
    only: z
      .array(z.string())
      .optional()
      .describe("Widget ids to show. The card shows only these widgets of the step.")
  }),
  async execute({ app_run_id, step }) {
    return { ok: true, ...getChatAppHandler(app_run_id).showStep(step) };
  }
});

FrontendToolRegistry.register({
  name: "ui_app_run_set_inputs",
  description:
    "Write app values by variable id (from ui_app_run_get_state.variables), " +
    "for a value the user gave in chat or a fix they accepted. Show the step " +
    "that holds them afterwards so the user can check.",
  parameters: z.object({
    app_run_id: appRunId,
    values: z.record(z.string(), z.unknown())
  }),
  async execute({ app_run_id, values }) {
    return { ok: true, ...getChatAppHandler(app_run_id).setInputs(values) };
  }
});

FrontendToolRegistry.register({
  name: "ui_app_run_operation",
  description:
    "Run one of the app's operations with the current values and wait for " +
    "it. Progress streams into the open card. Returns the status, the step " +
    "the operation moved to, a preview of its outputs, or the error with the " +
    "run id. A long run returns status \"running\": end the turn, and an " +
    "[app event] with settled reports the result. Run only what an " +
    "[app event] asked for or the user agreed to.",
  parameters: z.object({
    app_run_id: appRunId,
    operation_id: z.string()
  }),
  async execute({ app_run_id, operation_id }, { abortSignal }) {
    const result = await getChatAppHandler(app_run_id).runOperation(
      operation_id,
      abortSignal
    );
    return {
      ok: result.status === "completed" || result.status === "running",
      ...result
    };
  }
});

FrontendToolRegistry.register({
  name: "ui_app_run_cancel",
  description: "Stop a running operation of the app.",
  parameters: z.object({
    app_run_id: appRunId,
    operation_id: z.string()
  }),
  async execute({ app_run_id, operation_id }) {
    await getChatAppHandler(app_run_id).cancelOperation(operation_id);
    return { ok: true };
  }
});
