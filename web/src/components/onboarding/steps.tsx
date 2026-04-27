/** @jsxImportSource @emotion/react */
import React from "react";
import VpnKeyRoundedIcon from "@mui/icons-material/VpnKeyRounded";
import ChatBubbleOutlineRoundedIcon from "@mui/icons-material/ChatBubbleOutlineRounded";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import HubRoundedIcon from "@mui/icons-material/HubRounded";
import TimelineRoundedIcon from "@mui/icons-material/TimelineRounded";
import PlayCircleFilledRoundedIcon from "@mui/icons-material/PlayCircleFilledRounded";
import type { OnboardingStepId } from "../../stores/OnboardingStore";

export type HintPlacement = "top" | "bottom" | "left" | "right" | "center";

/** Live state passed into variant predicates by the overlay. */
export interface VariantContext {
  /** True when the floating node menu is currently open. */
  isNodeMenuOpen: boolean;
  /** Highest node count across any currently-open workflow. */
  maxNodeCount: number;
}

/**
 * A single visual variant of a step. The overlay picks the first variant
 * whose `when(ctx)` returns true and whose target selector resolves in the
 * DOM. Variants let one logical step swap its anchor + copy as the user
 * progresses (e.g. node menu closed → menu open).
 */
export interface OnboardingStepVariant {
  hintTitle: string;
  hintBody: string;
  targetSelector: string;
  hintPlacement?: HintPlacement;
  /** Predicate evaluated against live context. Defaults to always true. */
  when?: (ctx: VariantContext) => boolean;
}

export interface OnboardingStepDefinition {
  id: OnboardingStepId;
  /** Headline shown on the animated intro card. */
  title: string;
  /** Sub-headline / one-liner shown next to the title. */
  tagline: string;
  /** Body copy shown on the intro card. */
  description: string;
  /** Big illustration / icon shown on the intro card. */
  illustration: React.ReactNode;
  /** Accent gradient used by the intro card and hint chrome. */
  accent: { from: string; to: string };
  /** Route this step happens on. Empty string means "stay where you are". */
  route?: string;
  /** Short instruction shown in the floating hint over the real UI. */
  hintTitle: string;
  hintBody: string;
  /** CSS selector for the element the hint should anchor to. */
  targetSelector?: string;
  /** Side of the target where the hint should appear. */
  hintPlacement?: HintPlacement;
  /** Optional secondary call-to-action label. */
  ctaLabel?: string;
  /** If set, the hint shows an "Open Settings" button that jumps to this tab index. */
  settingsTab?: number;
  /** If set, the hint shows a "Download Models" button that navigates here. */
  modelsRoute?: string;
  /**
   * Optional sub-beats. The overlay tries each in order; the first matching
   * variant overrides the step's top-level hintTitle/hintBody/target/placement.
   */
  variants?: OnboardingStepVariant[];
}

export const ONBOARDING_STEPS: Record<OnboardingStepId, OnboardingStepDefinition> = {
  providers: {
    id: "providers",
    title: "Plug in your AI",
    tagline: "Step 1 of 6",
    description:
      "NodeTool talks to OpenAI, Anthropic, Gemini, OpenRouter, Hugging Face — or models running locally on your machine. Add an API key, or download a local model. One is enough to get going.",
    illustration: <VpnKeyRoundedIcon sx={{ fontSize: 96 }} />,
    accent: { from: "#7BA8FF", to: "#5C5DF6" },
    route: "/dashboard",
    hintTitle: "Find your provider, paste your key",
    hintBody:
      "Search for OpenAI, Anthropic, Gemini, or any other provider here, then paste a key. We'll continue automatically once at least one is set.",
    targetSelector: '[data-onboarding-target="provider-setup"]',
    hintPlacement: "bottom",
    ctaLabel: "Take me there",
    settingsTab: 1,
    modelsRoute: "/models"
  },
  chat: {
    id: "chat",
    title: "Just write to it",
    tagline: "Step 2 of 6",
    description:
      "The fastest way to use NodeTool is to chat. Ask a question, brainstorm, draft, refactor — the chat works with whichever model you connected.",
    illustration: <ChatBubbleOutlineRoundedIcon sx={{ fontSize: 96 }} />,
    accent: { from: "#74E0C7", to: "#3D8FE0" },
    route: "/chat",
    hintTitle: "Send your first message",
    hintBody:
      "Type something into the composer and press enter. Try \"Write me a haiku about node graphs.\"",
    targetSelector: '[data-onboarding-target="chat-composer"]',
    hintPlacement: "top",
    ctaLabel: "Open chat"
  },
  image: {
    id: "image",
    title: "Now make a picture",
    tagline: "Step 3 of 6",
    description:
      "Switch the chat into image mode and the same prompt becomes a generated image — through whichever image model you connected (cloud or local).",
    illustration: <AutoAwesomeRoundedIcon sx={{ fontSize: 96 }} />,
    accent: { from: "#FF8FCB", to: "#A35EF1" },
    route: "/chat",
    hintTitle: "Switch the mode chip → Image",
    hintBody:
      "Click the leftmost chip in the composer to change the mode to \"Generate Images\", then send a prompt like \"a watercolor dragon over a mountain\".",
    targetSelector: '[data-onboarding-target="media-mode-selector"]',
    hintPlacement: "top",
    ctaLabel: "Open chat"
  },
  nodes: {
    id: "nodes",
    title: "Add a String node",
    tagline: "Step 4 of 6",
    description:
      "We'll wire two nodes together. Start with a String node — it holds the text we'll feed to an Agent.",
    illustration: <HubRoundedIcon sx={{ fontSize: 96 }} />,
    accent: { from: "#FFC65A", to: "#F26D4F" },
    route: "/editor",
    hintTitle: "Add a String node",
    hintBody:
      "Press Space — or click the highlighted + button — to open the node menu.",
    targetSelector: '[data-onboarding-target="open-node-menu"]',
    hintPlacement: "top",
    ctaLabel: "Open editor",
    variants: [
      {
        // Menu open — tell them to search "String".
        hintTitle: "Search \"String\"",
        hintBody:
          "Type \"String\" and click the String node (under Constant) to drop it onto the canvas.",
        targetSelector: '[data-onboarding-target="node-menu-search"]',
        hintPlacement: "top",
        when: (ctx) => ctx.isNodeMenuOpen
      },
      {
        // Menu closed — point at the highlighted + button.
        hintTitle: "Add a String node",
        hintBody:
          "Press Space — or click the highlighted + button — to open the node menu.",
        targetSelector: '[data-onboarding-target="open-node-menu"]',
        hintPlacement: "top"
      }
    ]
  },
  connect: {
    id: "connect",
    title: "Add an Agent and wire it up",
    tagline: "Step 5 of 6",
    description:
      "Now add an Agent node and connect the String's output to the Agent's prompt input.",
    illustration: <TimelineRoundedIcon sx={{ fontSize: 96 }} />,
    accent: { from: "#9CFFB7", to: "#3CC68A" },
    route: "/editor",
    hintTitle: "Connect String → Agent",
    hintBody:
      "Drag from the String node's right-side output dot into the Agent's \"prompt\" input dot on its left edge.",
    targetSelector: '[data-onboarding-target="output-handle"]',
    hintPlacement: "top",
    ctaLabel: "Continue in editor",
    variants: [
      {
        // Menu open with only 1 node — guide to search Agent.
        hintTitle: "Search \"Agent\"",
        hintBody:
          "Type \"Agent\" and click the Agent node to add it next to the String node.",
        targetSelector: '[data-onboarding-target="node-menu-search"]',
        hintPlacement: "top",
        when: (ctx) => ctx.isNodeMenuOpen && ctx.maxNodeCount < 2
      },
      {
        // Menu closed, only 1 node — tell them to add an Agent.
        hintTitle: "Add an Agent node",
        hintBody:
          "Press Space and add an Agent node so we can hand the String to it.",
        targetSelector: '[data-onboarding-target="open-node-menu"]',
        hintPlacement: "top",
        when: (ctx) => ctx.maxNodeCount < 2
      },
      {
        // Two or more nodes — point at the first output handle and explain the wire.
        hintTitle: "Connect String → Agent",
        hintBody:
          "Drag from the String node's right-side output dot into the Agent's \"prompt\" input dot on its left edge.",
        targetSelector: '[data-onboarding-target="output-handle"]',
        hintPlacement: "top"
      }
    ]
  },
  run: {
    id: "run",
    title: "Press play",
    tagline: "Step 6 of 6",
    description:
      "Hit the run button (or ⌘ / Ctrl + Enter) and NodeTool streams the workflow through its actor runtime — every node updates live, results appear in the canvas.",
    illustration: <PlayCircleFilledRoundedIcon sx={{ fontSize: 96 }} />,
    accent: { from: "#7DE0FF", to: "#4673FF" },
    route: "/editor",
    hintTitle: "Run your workflow",
    hintBody:
      "Click the run button in the top toolbar, or press ⌘ / Ctrl + Enter. Watch the nodes light up as data flows through.",
    targetSelector: '[data-onboarding-target="run-workflow"]',
    hintPlacement: "bottom",
    ctaLabel: "Run it"
  }
};

export const getStepDefinition = (
  id: OnboardingStepId
): OnboardingStepDefinition => ONBOARDING_STEPS[id];

/**
 * Pick the first variant whose `when(ctx)` returns true. If a variant has
 * no `when`, it acts as the default (place it last). Returns null when no
 * variant matches — in which case the caller should fall back to the
 * step's top-level fields.
 */
export const resolveActiveVariant = (
  step: OnboardingStepDefinition,
  ctx: VariantContext
): OnboardingStepVariant | null => {
  if (!step.variants?.length) return null;
  for (const v of step.variants) {
    if (!v.when || v.when(ctx)) return v;
  }
  return null;
};
