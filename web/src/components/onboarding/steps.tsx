/** @jsxImportSource @emotion/react */
import React from "react";
import VpnKeyRoundedIcon from "@mui/icons-material/VpnKeyRounded";
import ChatBubbleOutlineRoundedIcon from "@mui/icons-material/ChatBubbleOutlineRounded";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import HubRoundedIcon from "@mui/icons-material/HubRounded";
import TimelineRoundedIcon from "@mui/icons-material/TimelineRounded";
import PlayCircleFilledRoundedIcon from "@mui/icons-material/PlayCircleFilledRounded";
import type { OnboardingStepId } from "../../stores/OnboardingStore";

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
  hintPlacement?: "top" | "bottom" | "left" | "right" | "center";
  /** Optional secondary call-to-action label. */
  ctaLabel?: string;
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
    hintTitle: "Add a provider key",
    hintBody:
      "Paste a key into any provider here, or download a local model. We'll continue automatically once at least one is configured.",
    targetSelector: '[data-onboarding-target="provider-setup"]',
    hintPlacement: "right",
    ctaLabel: "Take me there"
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
    targetSelector: '[data-onboarding-target="media-mode-chip"]',
    hintPlacement: "top",
    ctaLabel: "Open chat"
  },
  nodes: {
    id: "nodes",
    title: "Find and add nodes",
    tagline: "Step 4 of 6",
    description:
      "When you want to compose more than one step, drop into the editor. The node menu lets you search hundreds of building blocks — LLMs, image models, agents, code, audio, vector stores.",
    illustration: <HubRoundedIcon sx={{ fontSize: 96 }} />,
    accent: { from: "#FFC65A", to: "#F26D4F" },
    route: "/editor",
    hintTitle: "Press Space, or double-click the canvas",
    hintBody:
      "That opens the node menu. Search for any node and click it to drop it onto your workflow.",
    targetSelector: '[data-onboarding-target="editor-canvas"]',
    hintPlacement: "center",
    ctaLabel: "Open editor"
  },
  connect: {
    id: "connect",
    title: "Wire them together",
    tagline: "Step 5 of 6",
    description:
      "Drag from a node's output handle to another node's input handle to make a connection. NodeTool checks the types for you — green means it'll fit.",
    illustration: <TimelineRoundedIcon sx={{ fontSize: 96 }} />,
    accent: { from: "#9CFFB7", to: "#3CC68A" },
    route: "/editor",
    hintTitle: "Drag from output → input",
    hintBody:
      "Add a second node, then drag from the small dot on its right edge into the dot on another node's left edge.",
    targetSelector: '[data-onboarding-target="editor-canvas"]',
    hintPlacement: "center",
    ctaLabel: "Continue in editor"
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
