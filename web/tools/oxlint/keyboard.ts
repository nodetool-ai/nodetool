import { eslintCompatPlugin } from "@oxlint/plugins";

const MESSAGE =
  "Register a combo in KeyPressedStore instead of listening on window; " +
  "see web/src/stores/AGENTS.md § Keyboard";

const KEY_EVENTS = new Set(["keydown", "keyup", "keypress"]);
const GLOBALS = new Set(["window", "document"]);

/**
 * oxlint 1.78 has no `no-restricted-syntax`, so the selector this repo wants —
 * `window|document.addEventListener("keydown"|"keyup"|"keypress", …)` — is a
 * plugin rule instead. Same target, same message.
 */
const noWindowKeyListenerRule = {
  meta: {
    type: "problem" as const,
    docs: { description: "Route global key handling through KeyPressedStore." },
    messages: { restricted: MESSAGE },
    schema: []
  },
  create(context: {
    report: (descriptor: { node: unknown; messageId: string }) => void;
  }) {
    return {
      CallExpression(node: {
        callee: {
          type: string;
          object?: { type: string; name?: string };
          property?: { type: string; name?: string };
          computed?: boolean;
        };
        arguments: Array<{ type: string; value?: unknown }>;
      }) {
        const { callee } = node;
        if (callee.type !== "MemberExpression" || callee.computed) {
          return;
        }
        if (
          callee.object?.type !== "Identifier" ||
          !GLOBALS.has(callee.object.name ?? "")
        ) {
          return;
        }
        if (callee.property?.name !== "addEventListener") {
          return;
        }
        const first = node.arguments[0];
        if (
          first?.type !== "Literal" ||
          typeof first.value !== "string" ||
          !KEY_EVENTS.has(first.value)
        ) {
          return;
        }
        context.report({ node, messageId: "restricted" });
      }
    };
  }
};

export default eslintCompatPlugin({
  meta: { name: "keyboard" },
  rules: { "no-window-key-listener": noWindowKeyListenerRule }
});
