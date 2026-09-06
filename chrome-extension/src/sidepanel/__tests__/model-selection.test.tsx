/**
 * The picker's empty default and the send guard that goes with it.
 *
 * Sending with a model the server does not offer fails deep in the agent loop
 * with a provider error, so the panel refuses it up front. These cases pin
 * both halves: the rule, and what the user is shown while it holds.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Composer, canSend } from "../components/Composer.js";
import { ModelPicker } from "../components/ModelPicker.js";
import { isModelAvailable, sendBlockedReason } from "../modelSelection.js";

const GPT = { id: "gpt-5", name: "GPT-5", provider: "openai" };
const CLAUDE = { id: "claude-opus-5", name: "Claude Opus 5", provider: "anthropic" };

describe("sendBlockedReason", () => {
  it("blocks when nothing is chosen", () => {
    expect(sendBlockedReason(null, [GPT], false)).toBe("Choose a model to send.");
  });

  it("blocks a model this server does not offer", () => {
    expect(sendBlockedReason(CLAUDE, [GPT], false)).toMatch(
      /Claude Opus 5 is not available/,
    );
  });

  it("blocks a model whose provider differs from the offered one", () => {
    const sameIdOtherProvider = { ...GPT, provider: "azure" };
    expect(sendBlockedReason(sameIdOtherProvider, [GPT], false)).not.toBeNull();
  });

  it("allows a model the server offers", () => {
    expect(sendBlockedReason(GPT, [GPT, CLAUDE], false)).toBeNull();
  });

  it("says nothing while the model list is still loading", () => {
    expect(sendBlockedReason(CLAUDE, undefined, true)).toBeNull();
  });
});

describe("isModelAvailable", () => {
  it("is false with no model and false with no list", () => {
    expect(isModelAvailable(null, [GPT])).toBe(false);
    expect(isModelAvailable(GPT, undefined)).toBe(false);
  });
});

describe("ModelPicker", () => {
  it("asks for a choice when nothing is selected", () => {
    const html = renderToStaticMarkup(
      <ModelPicker models={[GPT]} value={null} onChange={() => {}} />,
    );
    expect(html).toContain('data-state="empty"');
    expect(html).toContain("Choose model");
  });

  it("marks a selected model the server no longer offers", () => {
    const html = renderToStaticMarkup(
      <ModelPicker
        models={[GPT]}
        value={CLAUDE}
        valid={false}
        onChange={() => {}}
      />,
    );
    expect(html).toContain('data-state="unavailable"');
  });

  it("shows the chosen model plainly when it is available", () => {
    const html = renderToStaticMarkup(
      <ModelPicker models={[GPT]} value={GPT} valid onChange={() => {}} />,
    );
    expect(html).toContain('data-state="chosen"');
    expect(html).toContain("GPT-5");
  });
});

describe("Composer", () => {
  const typed = {
    text: "summarise this page",
    disabled: false,
    streaming: false,
  };

  it("refuses a typed message while a model blocks it", () => {
    expect(canSend({ ...typed, blockedReason: "Choose a model to send." })).toBe(
      false,
    );
    expect(canSend({ ...typed, blockedReason: null })).toBe(true);
  });

  it("still refuses an empty message, a dead socket and a live turn", () => {
    expect(canSend({ ...typed, text: "   " })).toBe(false);
    expect(canSend({ ...typed, disabled: true })).toBe(false);
    expect(canSend({ ...typed, streaming: true })).toBe(false);
  });

  it("disables the send button and states the reason", () => {
    const html = renderToStaticMarkup(
      <Composer
        onSend={() => {}}
        onStop={() => {}}
        disabled={false}
        streaming={false}
        blockedReason="Choose a model to send."
      />,
    );
    expect(html).toContain("Choose a model to send.");
    expect(html).toMatch(/aria-label="Send"[^>]*disabled/);
  });

  it("enables sending when nothing blocks it", () => {
    const html = renderToStaticMarkup(
      <Composer
        onSend={() => {}}
        onStop={() => {}}
        disabled={false}
        streaming={false}
        blockedReason={null}
      />,
    );
    expect(html).not.toContain("composer__hint--blocked");
  });
});
