"use client";
/**
 * Four frames of one chat session, one tab each: the question, the work, the
 * bill, and what got delivered. The shots come out of the chat demo harness
 * (`web/scripts/screenshot-chat-casts.mjs` replaying the casts in
 * `web/src/demo/chat/marketing/`), so the panel on screen is the real one.
 *
 * Each tab is deep-linkable as `#chat-<id>`.
 */
import React, { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import {
  Compass,
  Clapperboard,
  Receipt,
  PackageCheck,
  type LucideIcon,
} from "lucide-react";
import { CHAT_SHOTS } from "../data/chatShots.generated";

interface Frame {
  /** Tab id, and the deep link fragment. */
  id: string;
  /** Cast id — the basename in `public/chat/` and the key into CHAT_SHOTS. */
  shot: string;
  label: string;
  icon: LucideIcon;
  headline: string;
  body: string;
}

const FRAMES: Frame[] = [
  {
    id: "ask",
    shot: "chat-capability-map",
    label: "Ask",
    icon: Compass,
    headline: "It reads the studio before it answers",
    body: "The agent checks what this install actually has — nodes, packs, example workflows — instead of guessing from a system prompt. The answer is a map of your workspace, not of the product.",
  },
  {
    id: "work",
    shot: "chat-storyboard-stills",
    label: "Work",
    icon: Clapperboard,
    headline: "Every step runs in the open",
    body: "A storyboard created, six keyframes rendered, a contact sheet built — each call is a card you can expand to see the code it ran and what came back. No spinner standing in for the work.",
  },
  {
    id: "cost",
    shot: "chat-cost-preview",
    label: "Cost",
    icon: Receipt,
    headline: "You see the bill before you pay it",
    body: "Your keys, your invoice. Asked to price the render, the agent reads the providers' own pages and puts the four candidates side by side, so the decision is yours and not a credit balance's.",
  },
  {
    id: "built",
    shot: "chat-trailer-delivered",
    label: "Built",
    icon: PackageCheck,
    headline: "It leaves documents, not a transcript",
    body: "The teaser is cut, and so are a storyboard, a timeline and a reusable workflow — each one a link that opens the editor. Change a shot and re-run; nothing has to be rebuilt from the chat.",
  },
];

const sizeOf = (shot: string) => {
  const found = CHAT_SHOTS.find((s) => s.id === shot);
  if (!found) throw new Error(`No screenshot for chat frame "${shot}"`);
  return found;
};

export default function ChatShowcase() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const fromHash = () => {
      const id = window.location.hash.replace("#chat-", "");
      const at = FRAMES.findIndex((f) => f.id === id);
      if (at !== -1) setActive(at);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  const select = useCallback((index: number) => {
    setActive(index);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#chat-${FRAMES[index].id}`);
    }
  }, []);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const delta =
        event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      if (!delta) return;
      event.preventDefault();
      select((active + delta + FRAMES.length) % FRAMES.length);
    },
    [active, select]
  );

  return (
    <div className="relative mx-auto max-w-5xl">
      <div
        role="tablist"
        aria-label="One chat session, four frames"
        onKeyDown={onKeyDown}
        className="flex flex-wrap justify-center gap-2 mb-8"
      >
        {FRAMES.map((frame, i) => {
          const Icon = frame.icon;
          const selected = i === active;
          return (
            <button
              key={frame.id}
              role="tab"
              id={`chat-tab-${frame.id}`}
              aria-selected={selected}
              aria-controls={`chat-panel-${frame.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(i)}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm focus-ring motion-safe:transition-colors ${
                selected
                  ? "border-slate-300 bg-slate-100 text-slate-900"
                  : "border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white"
              }`}
            >
              <Icon className="w-4 h-4" aria-hidden />
              {frame.label}
            </button>
          );
        })}
      </div>

      {FRAMES.map((frame, i) => {
        const size = sizeOf(frame.shot);
        return (
          <div
            key={frame.id}
            role="tabpanel"
            id={`chat-panel-${frame.id}`}
            aria-labelledby={`chat-tab-${frame.id}`}
            hidden={i !== active}
          >
            <div className="card relative overflow-hidden rounded-2xl border border-slate-800/60 bg-slate-900/60 ring-1 ring-white/5 backdrop-blur-md">
              <Image
                src={`/chat/${frame.shot}.webp`}
                alt={`${frame.label}: ${frame.headline}`}
                width={size.width}
                height={size.height}
                priority={i === 0}
                loading={i === 0 ? undefined : "lazy"}
                className="w-full h-auto block"
              />
            </div>

            <div className="mt-6 max-w-3xl">
              <h3 className="text-xl md:text-2xl font-semibold text-white">
                {frame.headline}
              </h3>
              <p className="mt-2 text-slate-300">{frame.body}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
